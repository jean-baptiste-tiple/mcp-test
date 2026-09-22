// Contexte d'UNE requête HTTP, partagé par la route, le registre et les handlers de tools.
// Sans ce fichier, ces types vivraient dans registry.ts — qui importe les handlers, lesquels
// ont besoin du contexte : le cycle d'imports serait immédiat. Il ne porte que des types et
// un accesseur, aucun état de module.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestId } from "@modelcontextprotocol/sdk/types.js"

import type { BenchFingerprint, BenchRepository } from "./repository"

/**
 * Ce qu'un `tools/call` a produit et que le body JSON-RPC journalisé par parseRpcBody ne
 * contient PAS : le serveur est le seul à le savoir. La route fusionne ces valeurs dans les
 * événements par `rpc_id` avant l'écriture (colonnes list_changed_sent, is_error, error_text).
 */
export type ToolOutcome = {
  listChangedSent?: boolean
  isError?: boolean
  errorText?: string
}

/** Ce que la route connaît AVANT que mcp-handler ne construise le McpServer de la requête. */
export type BenchRequestContext = {
  /** Injecté (pas importé) : les handlers écrivent par le repository, testable en mémoire. */
  repo: BenchRepository
  headers: Headers
  fingerprint: BenchFingerprint
  /** Injectée pour rendre les fenêtres d'ack et de gate déterministes en test. */
  now: () => Date
  /** Clé = id JSON-RPC de l'appel, stringifié comme `bench_events.rpc_id`. */
  outcomes: Map<string, ToolOutcome>
}

/** Ce que voit un handler de tool : la requête, le serveur MCP, et l'appel en cours. */
export type BenchToolContext = BenchRequestContext & {
  /** Pour notifier `tools/list_changed` après une mutation (ADR-001 : best effort). */
  server: McpServer
  /**
   * Id JSON-RPC BRUT de l'appel. Brut et pas stringifié : le transport du SDK indexe ses
   * flux de réponse par cet id, une clé de type différent ne retrouve aucun flux.
   */
  requestId: RequestId
}

/** Clé d'outcome : `bench_events.rpc_id` est du texte, l'id JSON-RPC peut être un nombre. */
function outcomeKey(requestId: RequestId): string {
  return String(requestId)
}

/** Outcome de l'appel courant, créé à la demande : aucun appelant ne peut le manquer. */
export function outcomeFor(ctx: BenchToolContext): ToolOutcome {
  const key = outcomeKey(ctx.requestId)
  const existing = ctx.outcomes.get(key)
  if (existing) return existing

  const outcome: ToolOutcome = {}
  ctx.outcomes.set(key, outcome)
  return outcome
}
