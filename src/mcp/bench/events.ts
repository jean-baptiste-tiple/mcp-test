// Journal : body JSON-RPC + en-têtes → lignes `bench_events` (architecture §4). C'est la
// seule trace de ce qu'un host a réellement demandé — sans elle le banc ne mesure rien.
// Le transport étant stateless (ADR-001), l'empreinte (user_agent, ip) est le seul lien
// entre deux requêtes d'une même conversation.
import { byteLength, truncateToBytes } from "@/lib/utils/byte-size"
import { MAX_EVENTS_PER_REQUEST, MAX_LOGGED_ARGS_BYTES } from "@/mcp/config"

import type { BenchEventInsert, BenchRepository } from "./repository"
import { toToolList } from "./registry"
import type { BenchSnapshot } from "./snapshot"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Une requête ou notification JSON-RPC ; une réponse (sans `method`) n'est pas journalisée. */
function isRpcRequest(value: unknown): value is Record<string, unknown> & { method: string } {
  return isRecord(value) && typeof value.method === "string"
}

// PostgreSQL refuse le caractère NUL ET les surrogates isolés, en jsonb comme en colonne
// text : une seule valeur contaminée fait échouer l'INSERT du batch ENTIER, donc perd
// toutes les lignes de la requête. Un couple de surrogates valide (emoji) survit : avec le
// drapeau u il forme un seul code point, qui n'a plus la catégorie Cs.
const UNSAFE_FOR_PG = /[\u0000]|\p{Cs}/gu

function sanitize(value: string): string {
  return value.replace(UNSAFE_FOR_PG, "�")
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return sanitize(value)
  if (typeof value === "number") return String(value) // id JSON-RPC numérique
  return null
}

function header(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  return value !== null && value !== "" ? value : null
}

/** `x-forwarded-for: <client>, <proxy1>, …` — seul le premier élément est l'appelant. */
function firstForwardedIp(headers: Headers): string | null {
  const forwarded = header(headers, "x-forwarded-for")
  if (forwarded === null) return null
  const first = forwarded.split(",")[0]?.trim()
  return first ? first : null
}

/**
 * Réécrit les caractères refusés par PostgreSQL en repartant de la sérialisation déjà
 * calculée. Le reviver ne voit que les VALEURS : une CLÉ portant un NUL passerait encore
 * (cas pathologique — les clés des arguments viennent du JSON du host).
 * `as` documenté : ce qui sort de JSON.parse EST du Json, TypeScript ne peut pas le voir.
 */
function withoutUnsafeChars(text: string): BenchEventInsert["args"] {
  return JSON.parse(text, (_key, value: unknown) =>
    typeof value === "string" ? sanitize(value) : value
  ) as BenchEventInsert["args"]
}

/**
 * `args` est stocké en jsonb : au-delà du plafond on garde une trace bornée plutôt que de
 * faire grossir la table (un scénario peut pousser 64 ko d'arguments par appel).
 */
function truncateArgs(args: unknown): BenchEventInsert["args"] {
  if (args === undefined) return null
  const text = JSON.stringify(args)
  if (text === undefined) return null

  const bytes = byteLength(text)
  if (bytes > MAX_LOGGED_ARGS_BYTES) {
    // `preview` est la sérialisation : NUL et surrogates isolés y sont déjà échappés
    // (`\u0000`, `\ud800`), et une coupe en plein caractère devient U+FFFD — rien d'unsafe.
    return { truncated: true, bytes, preview: truncateToBytes(text, MAX_LOGGED_ARGS_BYTES) }
  }

  return withoutUnsafeChars(text)
}

/**
 * Body JSON-RPC (objet OU batch) → événements. Ne jette jamais : un body illisible ne doit
 * pas casser la requête MCP, que mcp-handler traite de son côté.
 */
export function parseRpcBody(
  body: string,
  headers: Headers,
  snapshot: BenchSnapshot
): BenchEventInsert[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }

  // Plafond appliqué avant toute mise en forme : un batch hostile ne produit ni plus
  // d'événements ni plus d'INSERT que ça (endpoint public, aucun rate limiting).
  const requests = (Array.isArray(parsed) ? parsed : [parsed]).filter(isRpcRequest)
  const messages = requests.slice(0, MAX_EVENTS_PER_REQUEST)
  if (messages.length === 0) return []
  if (messages.length < requests.length) {
    // Sous-comptage silencieux = mesure fausse : il doit se voir dans les logs.
    console.warn("[bench] batch tronqué", { received: requests.length, kept: messages.length })
  }

  const common = {
    scenario_slug: snapshot.scenario?.slug ?? null,
    server_version: snapshot.serverInfo.version,
    user_agent: header(headers, "user-agent"),
    ip: firstForwardedIp(headers),
    session_id: header(headers, "mcp-session-id"), // toujours nul en stateless (ADR-001)
    protocol_version: header(headers, "mcp-protocol-version"),
  }

  // Ce que tools/list servira : calculé une fois même si le batch en contient plusieurs.
  let served: ReturnType<typeof toToolList> | null = null

  return messages.map((message) => {
    const params = isRecord(message.params) ? message.params : {}
    const clientInfo = isRecord(params.clientInfo) ? params.clientInfo : {}

    const event: BenchEventInsert = {
      ...common,
      method: message.method,
      rpc_id: asText(message.id),
      // clientInfo n'existe que sur initialize (ADR-001 : rien ne le rappelle ensuite).
      client_name: asText(clientInfo.name),
      client_version: asText(clientInfo.version),
      protocol_version: asText(params.protocolVersion) ?? common.protocol_version,
    }

    if (message.method === "tools/call") {
      event.tool_name = asText(params.name)
      event.args = truncateArgs(params.arguments)
    }

    if (message.method === "tools/list") {
      served ??= toToolList(snapshot)
      event.tools_served = served.length
      event.response_chars = JSON.stringify(served).length
    }

    return event
  })
}

/**
 * Écrit le journal. NE REJETTE JAMAIS : une panne du journal doit rester invisible du host
 * (la réponse MCP est déjà partie), mais bruyante dans les logs serveur.
 */
export async function logEvents(
  repo: BenchRepository,
  events: BenchEventInsert[]
): Promise<void> {
  if (events.length === 0) return
  try {
    await repo.insertEvents(events)
  } catch (error) {
    console.error("[bench] journalisation impossible", error)
  }
}
