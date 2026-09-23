// @vitest-environment node
// Fonctions d'observation et de révocation de la campagne E03 (E03-S07) contre le Supabase du banc :
// réservées à la clé secrète, lignes de `auth` sans secret ni jeton, sessions comptées puis révoquées.
// Sans ce test, rien ne prouverait qu'une clé publique ne peut ni lire `auth` ni révoquer, ni que la
// révocation coupe le rafraîchissement ; le constat de la preuve 8 (jeton d'accès encore accepté
// jusqu'à `exp`) n'aurait pas de référence. Utilisateur jetable, supprimé en fin de fichier.
import { randomBytes } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { userClient, type OauthTestDb } from "@/auth-test/db"

import { readEnv } from "../../scripts/lib/env.mjs"
import {
  authColumns,
  oauthAuthorizations,
  oauthConsents,
  registeredClients,
  revokeClientGrants,
  revokeUserSessions,
  userSessions,
} from "../../scripts/lib/oauth-admin.mjs"

import {
  anonDb,
  createTestUser,
  hasDb,
  INTEGRATION_TIMEOUT,
  signIn,
  signInSession,
  SKIP_REASON,
  stubPublicEnv,
  testDb,
  type TestUser,
} from "./auth-test-helpers"

/** Clés que registered_clients et user_sessions retirent (migration oauth_test_admin_v2). */
const SECRET_KEY = /secret|hash|hmac|refresh_token|access_token/i
/** Clés qu'oauth_authorizations et oauth_consents retirent, `code_challenge_method` excepté (même migration). */
const GRANT_SECRET_KEY = /code|nonce|secret|hash|hmac|token/i
const AUTH_TABLES = ["oauth_clients", "oauth_authorizations", "oauth_consents", "sessions", "refresh_tokens", "users"]

describe.skipIf(!hasDb)(`auth-test — observation et révocation${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: OauthTestDb
  let user: TestUser
  const unknownEmail = `personne-${randomBytes(4).toString("hex")}@example.test`

  beforeAll(async () => {
    stubPublicEnv()
    db = testDb()
    user = await createTestUser(db)
  }, 60_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    await user?.remove()
  }, 60_000)

  it("clé publique, sans jeton ou avec celui d'un utilisateur : chaque fonction refusée, rien de révoqué", async () => {
    const userDb = userClient(await signIn(user.email, user.password))
    for (const client of [anonDb(), userDb]) {
      const results = await Promise.all([
        client.rpc("auth_columns"),
        client.rpc("registered_clients"),
        client.rpc("user_sessions", { p_email: user.email }),
        client.rpc("oauth_authorizations"),
        client.rpc("oauth_authorizations", { p_email: user.email }),
        client.rpc("oauth_consents"),
        client.rpc("oauth_consents", { p_email: user.email }),
        client.rpc("revoke_user_sessions", { p_email: user.email }),
        client.rpc("revoke_client_grants", { p_email: user.email, p_client_name: "absent" }),
      ])
      for (const { data, error } of results) {
        expect(error?.code).toBe("42501")
        expect(data).toBeNull()
      }
    }
    expect((await userSessions(db, user.email)).length).toBeGreaterThanOrEqual(1)
  })

  it("auth_columns : colonnes des seules tables auth du serveur OAuth, dont auth.users", async () => {
    const rows = await authColumns(db)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows).toContainEqual(expect.objectContaining({ table_name: "users", column_name: "email" }))
    for (const row of rows) expect(AUTH_TABLES).toContain(row.table_name)
  })

  it("registered_clients : un tableau (vide tant qu'aucun host ne s'est enregistré), sans clé secret, hash, hmac ni jeton", async () => {
    const rows = await registeredClients(db)
    expect(Array.isArray(rows)).toBe(true)
    for (const row of rows) expect(Object.keys(row).filter((key) => SECRET_KEY.test(key))).toEqual([])
  })

  // Forme vérifiée sur les lignes présentes : aucune tant qu'aucun host ne s'est connecté (0 au 2026-09-23).
  it("oauth_authorizations et oauth_consents : toutes ou celles du compte ; sans code, nonce, secret ni jeton ; client_name et email présents", async () => {
    for (const read of [oauthAuthorizations, oauthConsents]) {
      const rows = await read(db)
      expect(Array.isArray(rows)).toBe(true)
      for (const row of rows) {
        expect(Object.keys(row).filter((key) => GRANT_SECRET_KEY.test(key) && key !== "code_challenge_method")).toEqual([])
        expect(row).toHaveProperty("client_name")
        expect(row).toHaveProperty("email")
      }
      // Utilisateur jetable : aucune connexion OAuth.
      expect(await read(db, user.email)).toEqual([])
    }
  })

  it("user_sessions puis revoke_user_sessions : refresh refusé, jeton d'accès encore accepté jusqu'à exp", async () => {
    const { accessToken, refreshToken } = await signInSession(user.email, user.password)
    const { session_id: sessionId } = decodeJwt(accessToken)

    const sessions = await userSessions(db, user.email)
    const mine = sessions.find((session) => session.id === sessionId)
    expect(mine?.refresh_tokens_total).toBeGreaterThanOrEqual(1)
    // Session par mot de passe : aucun client OAuth, nom rendu à null.
    expect(mine).toHaveProperty("client_name", null)
    // Clé HMAC et compteur des refresh tokens retirés : seuls restent les deux comptes ajoutés.
    for (const session of sessions) {
      expect(Object.keys(session).filter((key) => SECRET_KEY.test(key)).sort()).toEqual(["refresh_tokens_revoked", "refresh_tokens_total"])
    }

    expect(await revokeUserSessions(db, user.email)).toBeGreaterThanOrEqual(1)
    expect(await userSessions(db, user.email)).toEqual([])

    const env = readEnv()
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const refreshed = await client.auth.refreshSession({ refresh_token: refreshToken })
    expect(refreshed.error).not.toBeNull()
    expect(refreshed.data.session).toBeNull()

    // Constat de la preuve 8 : signature, émetteur et exp, ce que vérifie le serveur auth-test (§10.4),
    // ignorent la session supprimée ; le jeton reste accepté jusqu'à son exp.
    const issuer = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
    const { payload } = await jwtVerify(accessToken, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)), { issuer })
    expect(payload.sub).toBe(user.id)
    expect((payload.exp ?? 0) * 1000).toBeGreaterThan(Date.now())
  })

  it("revoke_client_grants : client inexistant, 0 ; les sessions hors OAuth du compte restent", async () => {
    await signIn(user.email, user.password)
    const before = await userSessions(db, user.email)
    expect(before.length).toBeGreaterThanOrEqual(1)

    expect(await revokeClientGrants(db, user.email, `absent-${randomBytes(4).toString("hex")}`)).toBe(0)
    expect(await userSessions(db, user.email)).toHaveLength(before.length)
  })

  it("email inconnu : erreur nommée, pour chaque fonction qui prend un email", async () => {
    const named = `compte inconnu : ${unknownEmail}`
    await expect(userSessions(db, unknownEmail)).rejects.toThrow(named)
    await expect(oauthAuthorizations(db, unknownEmail)).rejects.toThrow(named)
    await expect(oauthConsents(db, unknownEmail)).rejects.toThrow(named)
    await expect(revokeUserSessions(db, unknownEmail)).rejects.toThrow(named)
    await expect(revokeClientGrants(db, unknownEmail, "absent")).rejects.toThrow(named)
  })
})
