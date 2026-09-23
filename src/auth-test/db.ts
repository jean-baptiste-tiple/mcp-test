// Accès au schéma `oauth_test` du serveur auth-test (E03, architecture §10.2). Deux clés, deux droits :
// la clé secrète (getOauthTestClient d'admin.ts : organisation par hôte, journal, scripts) et le jeton de
// l'utilisateur (userClient). Sans userClient, l'appartenance ne pourrait être lue qu'à la clé secrète,
// qui passe outre la RLS : ADR-004 §5 (appartenance relue sous le jeton) ne serait pas tenu. Les fonctions
// d'orgs.ts et de journal.ts reçoivent le client, elles ne l'importent pas : admin.ts charge
// `server-only`, qui jette hors contexte serveur, et les tests n'y auraient pas accès.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { OauthTestDatabase } from "@/types/oauth-test-database"

export type OauthTestDb = SupabaseClient<OauthTestDatabase, "oauth_test">

/**
 * Client au nom de l'utilisateur : clé publique + son jeton en `Authorization`, donc rôle
 * `authenticated` et `auth.uid()` = son `sub` pour la RLS. Un client par jeton, sans session à garder
 * ni à rafraîchir : le jeton vient de la requête.
 */
export function userClient(token: string): OauthTestDb {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante (voir .env.example)")
  if (!publicKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY manquante (voir .env.example)")

  return createClient<OauthTestDatabase, "oauth_test">(url, publicKey, {
    db: { schema: "oauth_test" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Copie minimale de `must` de src/proto/db.ts, qui porte le message et l'étiquette de journal du proto.
type Result = { data: unknown; error: { code?: string; message: string } | null }

/** Panne de la base, sans nom de table : levée par must, rendue telle quelle par les routes (503). */
export const STORE_UNAVAILABLE = "Auth-test store unavailable"

/**
 * Données d'un résultat supabase-js ; une panne est journalisée ici (code et message : `details` recopie
 * la ligne en cause) et rendue sans nom de table.
 */
export function must<R extends Result>(result: R, what: string): R["data"] {
  if (result.error) {
    const { code, message } = result.error
    console.error(`[auth-test] ${what}`, { code, message })
    throw new Error(STORE_UNAVAILABLE)
  }
  return result.data
}
