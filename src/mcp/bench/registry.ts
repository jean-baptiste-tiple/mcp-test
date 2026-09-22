// Dispatch des `tools/call` : ce qu'un host OBTIENT quand il appelle un tool, garde readme
// comprise. Ce que le host VOIT (`tools/list`, instructions) est dans levers.ts.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { toolError } from "@/mcp/tool-result"

import { DEFAULT_ACK_WINDOW_SECONDS, getAckSecret, verifyAck } from "./ack"
import { outcomeFor, type BenchToolContext } from "./context"
import { echoHandler } from "./handlers/echo"
import { mutateHandler } from "./handlers/mutate"
import { readmeHandler } from "./handlers/readme"
import { whoamiHandler } from "./handlers/whoami"
import { leverOf, requiresAck, requiresGate, resolveToolRow } from "./levers"
import type { BenchToolRow } from "./repository"
import type { BenchSnapshot } from "./snapshot"

/** `args` d'abord (echo n'a besoin de rien d'autre), puis le contexte et le snapshot servi. */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: BenchToolContext,
  snapshot: BenchSnapshot
) => CallToolResult | Promise<CallToolResult>

/** Valeurs de `bench_tools.handler` implémentées par ce build (le check SQL en autorise 4). */
export type Handler = "echo" | "whoami" | "mutate" | "readme"

const handlers: Record<Handler, ToolHandler> = {
  echo: echoHandler,
  whoami: whoamiHandler,
  mutate: mutateHandler,
  readme: readmeHandler,
}

function isImplementedHandler(value: string): value is Handler {
  // `hasOwn` et pas `in` : la colonne `handler` est une donnée, `"toString"` ne doit pas
  // résoudre vers Object.prototype.
  return Object.hasOwn(handlers, value)
}

function firstText(result: CallToolResult): string | undefined {
  for (const block of result.content) {
    if (block.type === "text" && typeof block.text === "string") return block.text
  }
  return undefined
}

/**
 * Garde des leviers `ack` et `gate` : le tool readme reste TOUJOURS appelable, sinon le
 * scénario s'enferme lui-même. Retourne l'erreur à servir, ou null si l'appel peut passer.
 */
async function checkReadmeLever(
  snapshot: BenchSnapshot,
  row: BenchToolRow,
  args: Record<string, unknown>,
  ctx: BenchToolContext
): Promise<CallToolResult | null> {
  const scenario = snapshot.scenario
  if (!scenario || row.handler === "readme") return null

  const lever = leverOf(snapshot)

  if (requiresAck(lever)) {
    const verdict = verifyAck({
      secret: getAckSecret(),
      scenarioId: scenario.id,
      readmeContent: scenario.readme_content,
      ttlSeconds: scenario.ack_ttl_seconds,
      now: ctx.now(),
      candidate: typeof args.ack === "string" ? args.ack : "",
    })
    if (!verdict.valid) {
      return toolError(
        "Call bench_readme first and pass its ack." +
          (verdict.expired ? " Your ack has expired." : "")
      )
    }
  }

  if (requiresGate(lever)) {
    const windowSeconds = scenario.ack_ttl_seconds ?? DEFAULT_ACK_WINDOW_SECONDS
    const since = new Date(ctx.now().getTime() - windowSeconds * 1000)
    const seen = await ctx.repo.hasRecentReadmeCall(ctx.fingerprint, since)
    if (!seen) return toolError("Call bench_readme first.")
  }

  return null
}

async function runToolCall(
  snapshot: BenchSnapshot,
  name: string,
  args: Record<string, unknown>,
  ctx: BenchToolContext
): Promise<CallToolResult> {
  const row = resolveToolRow(snapshot, name)
  if (!row) {
    // Le cas normal du banc : le host appelle un tool d'un snapshot précédent (pas de
    // session, pas de cache serveur) — on lui dit comment se resynchroniser.
    return toolError(`Unknown tool ${name}. Call tools/list to refresh.`)
  }

  if (!isImplementedHandler(row.handler)) {
    return toolError(
      `Tool ${name} is listed but its handler "${row.handler}" is not implemented on this server. ` +
        `Call tools/list and use another tool.`
    )
  }

  const blocked = await checkReadmeLever(snapshot, row, args, ctx)
  if (blocked) return blocked

  // `ack` n'est PAS retiré des arguments : l'écho renvoie tout ce qu'il reçoit, et ce qu'un
  // host transmet réellement fait partie de la mesure.
  return handlers[row.handler](args, ctx, snapshot)
}

/**
 * `tools/call` : jamais d'exception, toujours un résultat MCP (mcp-patterns §4) — y compris
 * quand la configuration du serveur est fautive. `getAckSecret()` jette en production si
 * `BENCH_ACK_SECRET` manque : sans ce filet, l'agent reçoit une erreur de protocole opaque
 * et le journal n'en garde aucune trace, alors que c'est précisément ce qu'il faut voir.
 */
export async function dispatchToolCall(
  snapshot: BenchSnapshot,
  name: string,
  args: Record<string, unknown>,
  ctx: BenchToolContext
): Promise<CallToolResult> {
  let result: CallToolResult
  try {
    result = await runToolCall(snapshot, name, args, ctx)
  } catch (error) {
    console.error("[bench] tools/call", name, error)
    const message = error instanceof Error ? error.message : String(error)
    result = toolError(
      `Server misconfiguration: ${message}. Ask the operator to check BENCH_ACK_SECRET.`
    )
  }

  // ICI et pas dans chaque handler : toute erreur servie — garde de levier, tool inconnu ou
  // `toolError` d'un handler — doit se retrouver dans `bench_events.is_error`.
  if (result.isError) {
    const outcome = outcomeFor(ctx)
    outcome.isError = true
    outcome.errorText = firstText(result)
  }

  return result
}
