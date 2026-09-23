// Journal du serveur auth-test (FR-AUTH-07, architecture §10.4) : une ligne par requête MCP (401 et 404
// compris), par lecture des métadonnées et par affichage ou décision de consentement. Le journal fait foi :
// sans lui, rien de la campagne E03 (quel host suit le 401, quel client s'enregistre, qui est refusé)
// n'est vérifiable. Écrit avec la clé secrète (ADR-004 §6) : la RLS ne laisserait pas écrire les refus.
import { isRecord } from "@/lib/utils/is-record"
import { sanitizeText } from "@/lib/utils/sanitize-text"
import type { OauthTestDatabase } from "@/types/oauth-test-database"

import type { OauthTestDb } from "./db"

type JournalInsert = OauthTestDatabase["oauth_test"]["Tables"]["journal"]["Insert"]

/** Une ligne à écrire. `token` n'admet qu'un résumé de claims (summarizeClaims), que flushJournal repasse au filtre. */
export type JournalEntry = Omit<JournalInsert, "token"> & { token?: TokenSummary | null }

/** Ce que le journal et whoami gardent du jeton (NFR-AUTH-01) : ces claims-là, jamais le jeton ni une autre clé. */
export type TokenSummary = {
  iss?: string
  aud?: string | string[]
  sub?: string
  email?: string
  client_id?: string
  session_id?: string
  iat?: number
  exp?: number
  amr?: { method: string; timestamp: number }[] // Supabase ; tout autre élément, et toute autre clé d'un élément, écartés
  scope?: string
}

/**
 * Résumé des claims d'un jeton vérifié. Liste blanche : toute autre clé (`raw`, `access_token`,
 * métadonnées de l'utilisateur…) est ignorée, et une valeur d'un autre type que prévu aussi.
 * Idempotent : un résumé repassé au filtre revient tel quel (flushJournal s'en sert de garde).
 */
export function summarizeClaims(payload: unknown): TokenSummary {
  if (!isRecord(payload)) return {}
  const summary: TokenSummary = {}
  for (const key of ["iss", "sub", "email", "client_id", "session_id", "scope"] as const) {
    const value = payload[key]
    if (typeof value === "string") summary[key] = value
  }
  for (const key of ["iat", "exp"] as const) {
    const value = payload[key]
    if (typeof value === "number") summary[key] = value
  }
  const { aud, amr } = payload
  if (typeof aud === "string" || (Array.isArray(aud) && aud.every((a) => typeof a === "string"))) summary.aud = aud
  if (Array.isArray(amr)) {
    // Liste blanche jusque dans les éléments : { method, timestamp } seulement.
    summary.amr = amr.flatMap((entry) =>
      isRecord(entry) && typeof entry.method === "string" && typeof entry.timestamp === "number"
        ? [{ method: entry.method, timestamp: entry.timestamp }]
        : []
    )
  }
  return summary
}

/**
 * Colonnes d'identité d'une ligne, tirées du résumé d'un jeton VÉRIFIÉ seulement (un jeton refusé ne dit
 * rien de sûr, et un `user_id` qui n'est pas un uuid ferait tomber tout le lot) ; rien sans résumé.
 */
export function claimColumns(claims: TokenSummary | undefined): Pick<JournalEntry, "user_id" | "email" | "client_id" | "token"> {
  if (!claims) return {}
  return { user_id: claims.sub ?? null, email: claims.email ?? null, client_id: claims.client_id ?? null, token: claims }
}

/** Colonnes de la requête HTTP, communes à toutes les lignes qu'elle produit (whoami en rend host, path, user_agent). */
export type RequestFacts = { host: string; path: string; user_agent: string | null; ip: string | null }

/** Un message JSON-RPC du corps, sous les noms de colonnes du journal. */
export type RpcCall = { method: string; client_name: string | null }

/**
 * Messages journalisés au plus par requête. Un POST anonyme de plusieurs Mo (un lot de centaines de
 * milliers de `ping`) écrirait sinon autant de lignes, à la clé secrète, dans la base partagée. Même
 * plafond que le banc (src/mcp/bench/events.ts), non importé : les serveurs ne partagent pas de code.
 */
const MAX_CALLS = 100

function isRpcMessage(value: unknown): value is Record<string, unknown> & { method: string } {
  return isRecord(value) && typeof value.method === "string"
}

/**
 * Messages JSON-RPC d'un corps (objet ou lot), 100 au plus ; null si le corps n'est pas du JSON. Un 401 ou
 * un 404 est rendu avant tout handler, et `initialize` n'en a aucun à nous : seul le corps dit ce que le
 * host tentait et quel client s'annonce (`claude-ai@0.1.0`). Valeurs non fiables, nettoyées et tronquées
 * avant d'aller en base (sanitizeText).
 */
export function rpcCalls(body: string): RpcCall[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null // corps illisible : la route répond elle-même 400 Parse error (http.ts)
  }
  const messages = (Array.isArray(parsed) ? parsed : [parsed]).filter(isRpcMessage)
  const kept = messages.slice(0, MAX_CALLS)
  if (kept.length < messages.length) {
    // Un journal qui sous-compte en silence est un journal faux : la troncature se voit dans les logs.
    console.warn("[auth-test] lot tronqué", { received: messages.length, kept: kept.length })
  }
  return kept.map((message) => {
    const params = isRecord(message.params) ? message.params : {}
    const info = isRecord(params.clientInfo) ? params.clientInfo : null
    const clientName = message.method === "initialize" && info ? `${String(info.name ?? "?")}@${String(info.version ?? "?")}` : null
    return { method: sanitizeText(message.method, 100), client_name: clientName === null ? null : sanitizeText(clientName, 200) }
  })
}

/**
 * N'échoue jamais : un journal en panne ne change pas la réponse servie (un 401 reste un 401). `token`
 * repasse par summarizeClaims : un appelant qui y mettrait le payload vérifié entier, forcé en
 * TokenSummary, n'écrirait toujours que les dix claims admises.
 */
export async function flushJournal(db: OauthTestDb, entries: JournalEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    const rows = entries.map((entry) => (entry.token ? { ...entry, token: summarizeClaims(entry.token) } : entry))
    // defaultToNull: false : une colonne absente d'une entrée mais présente dans une autre prend son
    // défaut au lieu de null ; `ts` (not null) à null ferait tomber tout le lot.
    const { error } = await db.from("journal").insert(rows, { defaultToNull: false })
    // Code et message seulement : `details` recopie la ligne refusée (email, IP, résumé du jeton).
    if (error) console.error("[auth-test] journal", { code: error.code, message: error.message })
  } catch (error) {
    console.error("[auth-test] journal", error)
  }
}
