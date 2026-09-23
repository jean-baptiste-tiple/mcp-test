// Outils des tests d'intégration du serveur auth-test (architecture §10.6) : organisations jetables à
// hôtes jetables, seedées par le même module que `pnpm oauth:seed` ; utilisateurs jetables créés puis
// supprimés par l'API d'administration ; jeton réel obtenu par signInWithPassword (même clé de
// signature que le serveur OAuth). Sans eux, la RLS ne s'éprouverait que sur les comptes réels (JB,
// alias) et leurs organisations, que les tests modifieraient.
import { randomBytes } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { vi } from "vitest"

import type { OauthTestDb } from "@/auth-test/db"
import type { OauthTestDatabase } from "@/types/oauth-test-database"

import { readEnv } from "../../scripts/lib/env.mjs"
import { deleteOauthTestOrgs, seedOauthTest, type OauthSeedResult } from "../../scripts/lib/oauth-seed.mjs"

const env = readEnv()

/** Sans clés, les tests d'intégration auth-test sont sautés (message dans le describe). */
export const hasDb = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SECRET_KEY)
export const SKIP_REASON = "auth-test : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SECRET_KEY absente de .env.local"
/** Comptes, connexions, RLS : une dizaine d'allers-retours réseau par test ; 5 s ne suffisent pas. */
export const INTEGRATION_TIMEOUT = 30_000

const NO_SESSION = { persistSession: false, autoRefreshToken: false }

/** Clé secrète, schéma `oauth_test` : comme getOauthTestClient, sans `server-only`. */
export function testDb(): OauthTestDb {
  return createClient<OauthTestDatabase, "oauth_test">(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    db: { schema: "oauth_test" },
    auth: NO_SESSION,
  })
}

/** Clé publique sans jeton : ce que voit un appelant anonyme. */
export function anonDb(): OauthTestDb {
  return createClient<OauthTestDatabase, "oauth_test">(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "oauth_test" },
    auth: NO_SESSION,
  })
}

/** userClient lit process.env, comme sous Next : y pose les variables publiques de .env.local (défaire par vi.unstubAllEnvs). */
export function stubPublicEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL!)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export type TestOrgs = { suffix: string; seed: OauthSeedResult; drop: () => Promise<void> }

/**
 * Acme et Delta jetables : slugs, préfixes et hôtes suffixés (`acme-t1a2b.test`), sans membre. `drop`
 * les supprime avec leurs membres (cascade) et leurs lignes de journal (sans clé étrangère : par hôte).
 */
export async function seedTestOrgs(db: OauthTestDb): Promise<TestOrgs> {
  const suffix = `t${randomBytes(2).toString("hex")}` // préfixe `delta` + 5 caractères : sous la limite de 12
  const seed = await seedOauthTest(db, { suffix })
  const orgs = Object.values(seed.orgs)
  const drop = async () => {
    // finally : un journal qui ne se purge pas ne laisse pas les organisations derrière lui.
    try {
      const { error } = await db.from("journal").delete().in("host", orgs.map((org) => org.host))
      if (error) throw new Error(`nettoyage du journal : ${error.message}`)
    } finally {
      await deleteOauthTestOrgs(db, orgs.map((org) => org.slug))
    }
  }
  return { suffix, seed, drop }
}

/**
 * Email jetable et mot de passe aléatoire : createTestUser et le test d'ensureUser (qui crée le compte
 * lui-même). `Aa1-` : chaque classe de caractères qu'une politique de mot de passe du projet pourrait exiger.
 */
export function testCredentials(): { email: string; password: string } {
  return { email: `e03-${randomBytes(6).toString("hex")}@example.test`, password: `Aa1-${randomBytes(18).toString("base64url")}` }
}

export type TestUser = { id: string; email: string; password: string; remove: () => Promise<void> }

/** Utilisateur jetable, email confirmé ; `remove` le supprime, ses appartenances partent en cascade. */
export async function createTestUser(db: OauthTestDb): Promise<TestUser> {
  const { email, password } = testCredentials()
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`création de l'utilisateur de test : ${error.message}`)
  const { id } = data.user
  const remove = async () => {
    const { error: removeError } = await db.auth.admin.deleteUser(id)
    if (removeError) throw new Error(`suppression de l'utilisateur de test : ${removeError.message}`)
  }
  return { id, email, password, remove }
}

/** Jeton d'accès réel : signInWithPassword à la clé publique, comme la page de connexion. */
export async function signIn(email: string, password: string): Promise<string> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: NO_SESSION })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`connexion de ${email} : ${error.message}`)
  return data.session.access_token
}

/** Jetons d'accès et de rafraîchissement réels (révocation, E03-S07) : signIn ne rend que le premier. */
export async function signInSession(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: NO_SESSION })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`connexion de ${email} : ${error.message}`)
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
}
