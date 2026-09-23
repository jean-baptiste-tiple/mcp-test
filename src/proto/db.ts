// Accès au schéma `proto` pour les services du serveur proto (E04, architecture §9.2). Le client
// est injecté (route : getProtoClient() ; tests : client créé depuis .env.local), jamais importé :
// admin.ts charge `server-only`, qui jette hors contexte serveur, et les tests n'y auraient pas accès.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ProtoDatabase } from "@/types/proto-database"

export type ProtoDb = SupabaseClient<ProtoDatabase, "proto">

/** Message rendu au modèle quand la base répond mal : ni nom de table ni message PostgREST. */
export const STORE_UNAVAILABLE = "Proto store unavailable"

/** Données d'un résultat supabase-js, ou exception journalisée côté serveur. */
// Génériques sur la réponse entière plutôt que sur sa ligne : supabase-js type `data` en union
// succès | échec, et l'inférence d'un `T | null` y perd la ligne (lignes typées `never`).
type Result = { data: unknown; error: { message: string } | null }

/** Pour `.maybeSingle()` : la ligne ou null. */
export function must<R extends Result>(result: R, what: string): R["data"] {
  if (result.error) {
    console.error(`[proto] ${what}`, result.error)
    throw new Error(STORE_UNAVAILABLE)
  }
  return result.data
}

/** Pour une liste : les lignes, jamais null. */
export function many<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  return (must(result, what) ?? []) as NonNullable<R["data"]>
}

/** Pour `.single()` : une ligne attendue ; son absence est une panne, pas un refus. */
export function one<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  const data = must(result, what)
  if (data === null || data === undefined) {
    console.error(`[proto] ${what} : aucune ligne`)
    throw new Error(STORE_UNAVAILABLE)
  }
  return data as NonNullable<R["data"]>
}
