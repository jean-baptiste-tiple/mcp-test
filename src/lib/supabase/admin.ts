// Seul point d'accès aux tables du banc (ADR-002 §3) : clé secrète Supabase, RLS bypassé,
// RLS activé sans policy sur les tables → aucun accès par clé publique.
// `server-only` fait échouer le build si un module client l'importe : la clé ne peut pas
// partir dans un bundle navigateur.
import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
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
