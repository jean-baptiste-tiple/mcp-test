// Journal du serveur proto (architecture §9.4) : une ligne par requête traitée. Le journal fait
// foi, jamais le récit du modèle (E01 : ChatGPT annonce des succès qui n'ont pas eu lieu) ; sans
// lui, aucune preuve sur les hosts (premier appel, confirmations, tailles) n'est vérifiable.
import type { Json, ProtoDatabase } from "@/types/proto-database"

import type { ProtoDb } from "../db"

export type JournalEntry = ProtoDatabase["proto"]["Tables"]["journal"]["Insert"]

/** Arguments stockés : 2 ko suffisent à relire un appel ; la taille réelle va dans args_chars. */
export const MAX_LOGGED_ARGS_CHARS = 2048

export function loggedArgs(args: unknown): Json {
  const text = JSON.stringify(args ?? {})
  if (text.length <= MAX_LOGGED_ARGS_CHARS) return JSON.parse(text) as Json
  return { _truncated: true, head: text.slice(0, MAX_LOGGED_ARGS_CHARS) }
}

/**
 * `initialize` ne passe par aucun handler à nous : seul le body dit quel client s'annonce
 * (`claude-ai@0.1.0`). C'est la donnée qui identifie le host pendant une campagne.
 */
export function initializeEntries(body: string): string[] {
  try {
    const parsed: unknown = JSON.parse(body)
    const messages = Array.isArray(parsed) ? parsed : [parsed]
    return messages
      .filter((m) => m && typeof m === "object" && (m as { method?: unknown }).method === "initialize")
      .map((m) => {
        const info = (m as { params?: { clientInfo?: { name?: unknown; version?: unknown } } }).params?.clientInfo
        return `${String(info?.name ?? "?")}@${String(info?.version ?? "?")}`
      })
  } catch {
    return [] // body illisible : mcp-handler répondra l'erreur JSON-RPC, rien à journaliser ici
  }
}

/** N'échoue jamais : un journal en panne ne change pas la réponse servie au host. */
export async function flushJournal(db: ProtoDb, entries: JournalEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    // Insert groupé : PostgREST met à null toute colonne absente d'une ligne mais présente dans une
    // autre, défaut compris. `is_error` (not null) ferait alors tomber tout le lot.
    const { error } = await db.from("journal").insert(entries.map((entry) => ({ is_error: false, ...entry })))
    if (error) console.error("[proto] journal", error)
  } catch (error) {
    console.error("[proto] journal", error)
  }
}
