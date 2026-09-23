// Adaptateur MCP du serveur proto (architecture §9.2) : la route et les tests (InMemoryTransport)
// l'installent sur un McpServer. Il ne fait que vérifier le ctx, valider, appeler un service,
// mettre en forme et journaliser ; aucune logique métier.
//
// Handlers BAS NIVEAU (comme le banc) et pas registerTool : la garde ctx doit rendre notre message
// « call <prefix>_context first », pas l'erreur de validation générique du SDK sur un champ requis.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import type { ProtoDb } from "../db"
import type { Identity } from "../identity"
import { ProtoError, type ServiceResult } from "../result"
import { inputSchemas, parseInput, type ToolInput, type ToolKey } from "../schemas"
import { buildContext } from "../services/context"
import { requireCtx } from "../services/ctx"
import { callFunction } from "../services/call"
import { recordFeedback } from "../services/feedback"
import { find } from "../services/find"
import { read } from "../services/read"
import { write } from "../services/write"
import { type JournalEntry, loggedArgs } from "../services/journal"
import { getPrompt, listPrompts } from "../services/prompts"
import { buildTools, serverInstructions, toolKey } from "./tools"

/** Version du contrat servi ; les hosts ne la montrent pas (E01), elle date le journal. */
export const PROTO_SERVER_VERSION = "0.1.0"

/** Au-delà, un appel est refusé avant tout traitement (mesure 4 : 1 Mo, architecture §9.6). */
export const MAX_ARGS_CHARS = 1_000_000

export type ProtoDeps = {
  db: ProtoDb
  identity: Identity
  userAgent: string | null
  /** Entrées empilées pendant la requête ; la route les écrit après la réponse. */
  journal: JournalEntry[]
}

export function buildServerOptions(identity: Identity) {
  return {
    serverInfo: { name: `${identity.org.prefix}-proto`, title: identity.org.name, version: PROTO_SERVER_VERSION },
    instructions: serverInstructions(identity.org),
    // prompts : prompts suggérés, mesure 2 du doc fonctionnel (E04-S05).
    capabilities: { tools: {}, prompts: {} },
  }
}

type Service<K extends ToolKey> = (deps: ProtoDeps, input: ToolInput<K>, ctx: string) => Promise<ServiceResult>

const SERVICES: { [K in ToolKey]: Service<K> } = {
  context: ({ db, identity, userAgent }, input) => buildContext(db, identity, input, userAgent),
  find: ({ db, identity }, input) => find(db, identity, input),
  read: ({ db, identity }, input) => read(db, identity, input),
  call: ({ db, identity }, input) => callFunction(db, identity, input),
  write: ({ db, identity }, input) => write(db, identity, input),
  feedback: ({ db, identity }, input, ctx) => recordFeedback(db, identity, input, ctx),
}

function baseEntry(deps: ProtoDeps): JournalEntry {
  return { method: "", org_id: deps.identity.org.id, user_id: deps.identity.user.id, user_agent: deps.userAgent }
}

async function runTool(deps: ProtoDeps, name: string, args: Record<string, unknown>) {
  const { db, identity } = deps
  const prefix = identity.org.prefix
  const started = Date.now()
  const argsText = JSON.stringify(args)
  const entry: JournalEntry = {
    ...baseEntry(deps),
    method: "tools/call",
    tool: name,
    ctx: typeof args.ctx === "string" ? args.ctx : null,
    // Posée avant le service : un appel refusé (droits, arguments) garde sa cible au journal.
    // Tronquée : non encore validée, elle part dans une colonne indexée (btree).
    target: (typeof args.function === "string" ? args.function : typeof args.path === "string" ? args.path : null)?.slice(0, 200) ?? null,
    args: loggedArgs(args),
    args_chars: argsText.length,
  }

  try {
    const key = toolKey(prefix, name)
    if (!key) throw new ProtoError(`Unknown tool ${name}. The tools of this server all start with ${prefix}_.`)
    if (argsText.length > MAX_ARGS_CHARS) {
      throw new ProtoError(`Arguments too large (${argsText.length} characters, max ${MAX_ARGS_CHARS}). Split the content into several calls.`)
    }

    const ctx = key === "context" ? "" : await requireCtx(db, identity, args.ctx)
    const parsed = parseInput(inputSchemas(prefix)[key], args)
    if ("issues" in parsed) throw new ProtoError(`Invalid arguments for ${name}: ${parsed.issues}`)

    const result = await (SERVICES[key] as Service<ToolKey>)(deps, parsed.data, ctx)
    Object.assign(entry, {
      ctx: result.ctx ?? entry.ctx,
      target: result.target ?? entry.target ?? null,
      team_id: result.teamId ?? null,
      is_error: false,
      result_chars: result.text.length,
    })
    // Même chaîne dans les deux canaux (preuve 5) : Claude Code ne lit que structuredContent,
    // claude.ai et ChatGPT le texte (mcp-patterns §4).
    return { content: [{ type: "text" as const, text: result.text }], structuredContent: { text: result.text } }
  } catch (error) {
    const message =
      error instanceof ProtoError ? error.message : `Internal error. Retry once, then report it with ${prefix}_feedback (type error).`
    if (!(error instanceof ProtoError)) console.error("[proto] tools/call", name, error)
    Object.assign(entry, { is_error: true, error: message, result_chars: message.length })
    return { isError: true, content: [{ type: "text" as const, text: message }] }
  } finally {
    entry.duration_ms = Date.now() - started
    deps.journal.push(entry)
  }
}

export function installProto(server: McpServer, deps: ProtoDeps): void {
  server.server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = buildTools(deps.identity.org)
    deps.journal.push({ ...baseEntry(deps), method: "tools/list", result_chars: JSON.stringify(tools).length })
    return { tools }
  })

  server.server.setRequestHandler(CallToolRequestSchema, (request) =>
    runTool(deps, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>)
  )

  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = await listPrompts(deps.db, deps.identity)
    const listed = prompts.map(({ name, title, description }) => ({ name, title, description }))
    deps.journal.push({ ...baseEntry(deps), method: "prompts/list", result_chars: JSON.stringify(listed).length })
    return { prompts: listed }
  })

  server.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const entry: JournalEntry = { ...baseEntry(deps), method: "prompts/get", target: request.params.name.slice(0, 200) }
    try {
      const prompt = await getPrompt(deps.db, deps.identity, request.params.name)
      Object.assign(entry, { is_error: false, result_chars: prompt.text.length })
      return { description: prompt.description, messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.text } }] }
    } catch (error) {
      Object.assign(entry, { is_error: true, error: error instanceof Error ? error.message : String(error) })
      throw error // erreur JSON-RPC : le host montre « Unknown prompt »
    } finally {
      deps.journal.push(entry)
    }
  })
}
