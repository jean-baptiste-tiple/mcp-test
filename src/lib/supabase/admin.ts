// Seul point d'accès aux tables du banc (ADR-002 §3) : clé secrète Supabase, RLS bypassé. Tables
// `bench_*` et `proto` : RLS activé sans policy → aucun accès par clé publique. Schéma `oauth_test` :
// `orgs` et `members` lisibles sous le jeton d'un utilisateur, ses lignes seulement (policies
// `authenticated`, auth-test/db.ts userClient), rien sans jeton ; tout le reste à la clé secrète.
// `server-only` fait échouer le build si un module client l'importe : la clé ne peut pas
// partir dans un bundle navigateur.
import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import type { OauthTestDatabase } from "@/types/oauth-test-database"
import type { ProtoDatabase } from "@/types/proto-database"

// Mémoïsé : un client par process, sinon chaque appel instancie un GoTrueClient de plus.
let adminClient: SupabaseClient<Database> | null = null

export function getAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante (voir .env.example)")
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquante (voir .env.example)")

  adminClient = createClient<Database>(url, secretKey, {
    // Pas de session à persister ni à rafraîchir : clé de service, contexte serveur.
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

// Serveur proto (E04, ADR-003 §3) : même clé, schéma `proto`. Client distinct parce que le typage
// de supabase-js se fixe à la création : `adminClient.schema("proto")` perdrait les types de proto.
let protoClient: SupabaseClient<ProtoDatabase, "proto"> | null = null

export function getProtoClient(): SupabaseClient<ProtoDatabase, "proto"> {
  if (protoClient) return protoClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante (voir .env.example)")
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquante (voir .env.example)")

  protoClient = createClient<ProtoDatabase, "proto">(url, secretKey, {
    db: { schema: "proto" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return protoClient
}

// Serveur auth-test (E03, ADR-004 §6) : même clé, schéma `oauth_test`, pour ce que la RLS ne laisse pas
// faire au nom de l'utilisateur : organisation par hôte (avant tout jeton), journal (401 et refus compris),
// page de consentement. Jamais pour lire une donnée au nom de l'utilisateur : userClient (auth-test/db.ts).
let oauthTestClient: SupabaseClient<OauthTestDatabase, "oauth_test"> | null = null

export function getOauthTestClient(): SupabaseClient<OauthTestDatabase, "oauth_test"> {
  if (oauthTestClient) return oauthTestClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante (voir .env.example)")
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquante (voir .env.example)")

  oauthTestClient = createClient<OauthTestDatabase, "oauth_test">(url, secretKey, {
    db: { schema: "oauth_test" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return oauthTestClient
}
