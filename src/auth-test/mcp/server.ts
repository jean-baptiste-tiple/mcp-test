// Adaptateur MCP du serveur auth-test (architecture §10.4 étapes 3 et 4) : la route (http.ts) et les tests
// (InMemoryTransport) l'installent sur un McpServer. Avant tout outil, l'appartenance à l'organisation de
// l'hôte est relue sous le jeton de l'utilisateur, sans cache (ADR-004 §5) ; chaque tools/list et tools/call
// laisse une ligne de journal. Sans lui, un jeton valide suffirait à appeler les outils de n'importe quelle
// organisation, et whoami n'aurait rien à rendre.
//
// Handlers BAS NIVEAU (comme le proto) : la garde d'appartenance passe avant toute validation d'arguments,
// un non-membre ne lit que son refus.
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import { byteLength } from "@/lib/utils/byte-size"
import { sanitizeText } from "@/lib/utils/sanitize-text"
import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { userClient } from "../db"
import { claimColumns, type JournalEntry, type RequestFacts, type TokenSummary } from "../journal"
import { isMember } from "../orgs"
import { authClaims } from "../token"
import { buildTools, EchoInput, MAX_ARGS_BYTES, serverInstructions, toolKey, WhoamiInput } from "./tools"

/** Version du contrat servi ; aucun host ne la montre (E01), elle date le journal. */
const AUTH_TEST_SERVER_VERSION = "1.0.0"

export type AuthTestServerDeps = {
  /** Organisation de l'hôte appelé, jamais du jeton (ADR-004 §4). */
  org: OauthTestOrgRow
  request: RequestFacts
  /** Lignes empilées pendant la requête ; la route les écrit après la réponse. */
  journal: JournalEntry[]
}

type ToolResult = {
  content: { type: "text"; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: true
}

type MemberCall = { name: string; args: Record<string, unknown>; claims: TokenSummary }

export function buildServerOptions(org: OauthTestOrgRow) {
  return {
    serverInfo: { name: `${org.slug}-auth-test`, title: `${org.name} (auth test)`, version: AUTH_TEST_SERVER_VERSION },
    instructions: serverInstructions(org),
    capabilities: { tools: {} },
  }
}

// Même chaîne dans les deux canaux : Claude Code ne lit que structuredContent, claude.ai et ChatGPT le
// texte (mcp-patterns §4).
function success(text: string, fields: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: { text, ...fields } }
}

/** Refus actionnable, texte seul : aucune autre donnée. */
function failure(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] }
}

function notMember(claims: TokenSummary, org: OauthTestOrgRow): string {
  const who = claims.email || `user ${claims.sub ?? "unknown"}`
  return `You are signed in as ${who} but you are not a member of ${org.name}. Ask an administrator of ${org.name} to add you.`
}

function invalidArgs(entry: JournalEntry, name: string, error: { issues: { path: PropertyKey[]; message: string }[] }): ToolResult {
  entry.reason = "invalid_args"
  const issues = error.issues.map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
  return failure(`Invalid arguments for ${name}: ${issues.join("; ")}`)
}

function isoTime(epochSeconds: number | undefined): string {
  return epochSeconds === undefined ? "none" : new Date(epochSeconds * 1000).toISOString()
}

function whoami(deps: AuthTestServerDeps, call: MemberCall, note: string | undefined): ToolResult {
  const { org, request } = deps
  const { claims } = call
  const expiresIn = claims.exp === undefined ? null : claims.exp - Math.floor(Date.now() / 1000)
  const token = {
    iss: claims.iss ?? null,
    aud: claims.aud ?? null,
    client_id: claims.client_id ?? null,
    session_id: claims.session_id ?? null,
    iat: claims.iat ?? null,
    exp: claims.exp ?? null,
    expires_in_s: expiresIn,
    amr: claims.amr ?? null,
    ...(claims.scope === undefined ? {} : { scope: claims.scope }),
  }
  const audience = Array.isArray(claims.aud) ? claims.aud.join(", ") : (claims.aud ?? "none")
  const text = [
    `You are signed in as ${claims.email || "an account without email"} (user id ${claims.sub ?? "none"}) and you are a member of ${org.name}.`,
    `Organisation: ${org.name}, slug ${org.slug}, host ${org.host}, tools ${org.prefix}_*.`,
    `Access token: issuer ${claims.iss ?? "none"}; audience ${audience}; client ${claims.client_id ?? "none"}; session ${claims.session_id ?? "none"}; issued ${isoTime(claims.iat)}; expires ${isoTime(claims.exp)} (in ${expiresIn ?? "?"} s); amr ${JSON.stringify(claims.amr ?? [])}; scope ${claims.scope ?? "none"}.`,
    `Request: host ${request.host}, path ${request.path}, user agent ${request.user_agent ?? "none"}.`,
    `Note: ${note ?? "none"}.`,
  ].join("\n")
  return success(text, {
    person: { id: claims.sub ?? null, email: claims.email ?? null },
    organisation: { slug: org.slug, name: org.name, host: org.host, prefix: org.prefix },
    membership: { member: true },
    token,
    request: { host: request.host, path: request.path, user_agent: request.user_agent },
    note: note ?? null,
    next_actions: [`${org.prefix}_echo`],
  })
}

/** Outil d'un membre : nom, plafond, arguments, puis l'outil ; un échec garde son motif au journal. */
function runTool(deps: AuthTestServerDeps, entry: JournalEntry, call: MemberCall): ToolResult {
  const { org } = deps
  const { name, args } = call
  const key = toolKey(org.prefix, name)
  if (!key) {
    entry.reason = "unknown_tool"
    return failure(`Unknown tool ${name}. The tools of this server are ${org.prefix}_whoami and ${org.prefix}_echo.`)
  }
  const bytes = byteLength(JSON.stringify(args))
  if (bytes > MAX_ARGS_BYTES) {
    entry.reason = "args_too_large"
    return failure(`Arguments too large for ${name}: ${bytes} bytes, max ${MAX_ARGS_BYTES}. Send a shorter message.`)
  }
  if (key === "whoami") {
    const parsed = WhoamiInput.safeParse(args)
    if (!parsed.success) return invalidArgs(entry, name, parsed.error)
    return whoami(deps, call, parsed.data.note)
  }
  const parsed = EchoInput.safeParse(args)
  if (!parsed.success) return invalidArgs(entry, name, parsed.error)
  return success(JSON.stringify(args), { args, next_actions: [`${org.prefix}_whoami`] })
}

async function callTool(deps: AuthTestServerDeps, name: string, args: Record<string, unknown>, auth: AuthInfo | undefined): Promise<ToolResult> {
  const { org } = deps
  const claims = authClaims(auth)
  const entry: JournalEntry = {
    ...deps.request,
    org_slug: org.slug,
    ...claimColumns(claims),
    method: "tools/call",
    tool: sanitizeText(name, 200), // nom envoyé par le host, non validé à ce stade
    decision: "allowed",
  }
  try {
    // Impossible derrière withMcpAuth (401 avant tout handler) ; gardé pour un transport sans jeton.
    if (!auth || !claims) {
      entry.decision = "unauthenticated"
      entry.reason = "missing"
      return failure(`You are not signed in. Reconnect the ${org.name} connector.`)
    }

    let member: boolean
    try {
      member = await isMember(userClient(auth.token), org.id)
    } catch (error) {
      // must() a déjà écrit la panne PostgREST ; ici, le message seul (clé publique absente, par exemple).
      console.error("[auth-test] appartenance", error instanceof Error ? error.message : String(error))
      // Aucune décision « panne » au journal (check de la migration) : refus, motif explicite.
      entry.decision = "denied_not_member"
      entry.reason = "membership_unavailable"
      return failure(`Could not check your membership of ${org.name} right now. Retry in a moment.`)
    }
    if (!member) {
      entry.decision = "denied_not_member"
      return failure(notMember(claims, org))
    }
    return runTool(deps, entry, { name, args, claims })
  } finally {
    deps.journal.push(entry)
  }
}

export function installAuthTest(server: McpServer, deps: AuthTestServerDeps): void {
  // Servi à tout jeton valide, membre ou non (ADR-004 §5) : la connexion passe, les appels sont refusés.
  server.server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
    deps.journal.push({ ...deps.request, org_slug: deps.org.slug, ...claimColumns(authClaims(extra.authInfo)), method: "tools/list", decision: "allowed" })
    return { tools: buildTools(deps.org) }
  })

  server.server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
    callTool(deps, request.params.name, request.params.arguments ?? {}, extra.authInfo)
  )
}
