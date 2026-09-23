// @vitest-environment node
// Socle du serveur auth-test (E03-S01) contre le Supabase du banc (architecture §10.6) : seed rejouable,
// organisation par hôte, RLS de members et orgs sous le jeton d'utilisateurs jetables, journal, et
// l'exposition PostgREST qui garde proto. Organisations et utilisateurs jetables, supprimés en fin de fichier.
import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { userClient, type OauthTestDb } from "@/auth-test/db"
import { flushJournal, summarizeClaims, type JournalEntry } from "@/auth-test/journal"
import { isMember, resolveOrg } from "@/auth-test/orgs"
import type { ProtoDatabase } from "@/types/proto-database"

import { readEnv } from "../../scripts/lib/env.mjs"
import { OAUTH_ORGS } from "../../scripts/lib/oauth-data.mjs"
import { ensureUser, seedOauthTest, setMember } from "../../scripts/lib/oauth-seed.mjs"

import {
  anonDb,
  createTestUser,
  hasDb,
  INTEGRATION_TIMEOUT,
  seedTestOrgs,
  signIn,
  SKIP_REASON,
  stubPublicEnv,
  testCredentials,
  testDb,
  type TestOrgs,
  type TestUser,
} from "./auth-test-helpers"

const CLAIM_KEYS = ["iss", "aud", "sub", "email", "client_id", "session_id", "iat", "exp", "amr", "scope"]

describe.skipIf(!hasDb)(`auth-test — schéma, seed, journal${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: OauthTestDb
  let orgs: TestOrgs
  // Comme JB (membre des deux), l'alias (Acme seulement), et un compte d'aucune organisation.
  let both: TestUser
  let acmeOnly: TestUser
  let none: TestUser
  let bothDb: OauthTestDb
  let acmeOnlyDb: OauthTestDb
  let noneDb: OauthTestDb

  const acme = () => orgs.seed.orgs.acme
  const delta = () => orgs.seed.orgs.delta
  const memberRows = async () =>
    (await db.from("members").select("org_id, user_id").in("org_id", [acme().id, delta().id])).data ?? []

  beforeAll(async () => {
    stubPublicEnv()
    db = testDb()
    orgs = await seedTestOrgs(db)
    // Un par un : si une création échoue, ceux déjà créés restent assignés et afterAll les supprime.
    both = await createTestUser(db)
    acmeOnly = await createTestUser(db)
    none = await createTestUser(db)
    await setMember(db, acme().slug, both.email, "add")
    await setMember(db, delta().slug, both.email, "add")
    await setMember(db, acme().slug, acmeOnly.email, "add")
    ;[bothDb, acmeOnlyDb, noneDb] = await Promise.all(
      [both, acmeOnly, none].map(async (user) => userClient(await signIn(user.email, user.password)))
    )
  }, 60_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    // allSettled : un nettoyage en échec n'arrête pas les autres ; les échecs sont levés ensemble ensuite.
    const results = await Promise.allSettled([orgs?.drop(), ...[both, acmeOnly, none].filter(Boolean).map((user) => user.remove())])
    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, `nettoyage auth-test : ${failures.map(String).join(" ; ")}`)
  }, 60_000)

  it("seed : les données de oauth-data, suffixées ; rejoué, mêmes lignes, appartenances intactes", async () => {
    const { suffix } = orgs
    for (const org of OAUTH_ORGS) {
      expect(orgs.seed.orgs[org.slug]).toMatchObject({
        slug: `${org.slug}-${suffix}`,
        name: org.name,
        prefix: `${org.prefix}${suffix}`,
        host: `${org.slug}-${suffix}.test`,
      })
    }

    const again = await seedOauthTest(db, { suffix })
    expect(again.orgs).toEqual(orgs.seed.orgs)
    const rows = (await db.from("orgs").select("id").in("slug", [acme().slug, delta().slug])).data ?? []
    expect(rows).toHaveLength(2)
    expect(await memberRows()).toHaveLength(3)
  })

  it("ensureUser : crée l'absent ; un existant (email en majuscules) est rendu tel quel, mot de passe inchangé", async () => {
    const { email, password } = testCredentials()
    let id: string | undefined
    try {
      const created = await ensureUser(db, email, password)
      id = created.id
      expect(created).toEqual({ id: expect.any(String), created: true })
      expect(await ensureUser(db, email.toUpperCase(), testCredentials().password)).toEqual({ id, created: false })
      // L'ancien mot de passe ouvre toujours une session : le second appel n'a rien modifié.
      expect(await signIn(email, password)).toEqual(expect.any(String))
    } finally {
      if (id) {
        const { error } = await db.auth.admin.deleteUser(id)
        if (error) throw new Error(`suppression du compte de test : ${error.message}`)
      }
    }
  })

  it("setMember : ajout rejoué sans doublon (casse ignorée), retrait d'un absent sans erreur ; inconnus nommés", async () => {
    expect(await setMember(db, acme().slug, both.email.toUpperCase(), "add")).toBe(false)
    expect(await setMember(db, delta().slug, acmeOnly.email, "remove")).toBe(false)
    await expect(setMember(db, `inconnue-${orgs.suffix}`, both.email, "add")).rejects.toThrow(`organisation inconnue : inconnue-${orgs.suffix}`)
    await expect(setMember(db, acme().slug, "personne@example.test", "add")).rejects.toThrow("compte inconnu : personne@example.test")
    expect(await memberRows()).toHaveLength(3)
  })

  it("resolveOrg : l'hôte normalisé désigne l'organisation ; inconnu ou vide : null", async () => {
    expect(await resolveOrg(db, acme().host)).toEqual(acme())
    expect(await resolveOrg(db, ` ${delta().host.toUpperCase()}:443 `)).toEqual(delta())
    expect(await resolveOrg(db, `inconnu-${orgs.suffix}.test`)).toBeNull()
    expect(await resolveOrg(db, "")).toBeNull()
  })

  it("RLS sous jeton : chacun ne lit que ses lignes de members et ses organisations", async () => {
    // Lectures sans erreur : une panne rendrait `data` null, lu comme « aucune ligne ».
    const read = async (userDb: OauthTestDb) => {
      const members = await userDb.from("members").select("org_id, user_id")
      const orgRows = await userDb.from("orgs").select("slug")
      expect(members.error).toBeNull()
      expect(orgRows.error).toBeNull()
      return {
        members: (members.data ?? []).map((m) => `${m.org_id}:${m.user_id}`).sort(),
        orgs: (orgRows.data ?? []).map((o) => o.slug).sort(),
      }
    }

    expect(await read(bothDb)).toEqual({
      members: [`${acme().id}:${both.id}`, `${delta().id}:${both.id}`].sort(),
      orgs: [acme().slug, delta().slug].sort(),
    })
    expect(await read(acmeOnlyDb)).toEqual({ members: [`${acme().id}:${acmeOnly.id}`], orgs: [acme().slug] })
    expect(await read(noneDb)).toEqual({ members: [], orgs: [] })
  })

  it("sous jeton : insert, delete et lecture du journal refusés", async () => {
    const insert = await bothDb.from("members").insert({ org_id: delta().id, user_id: acmeOnly.id, email: acmeOnly.email })
    expect(insert.error?.code).toBe("42501")
    const remove = await bothDb.from("members").delete().eq("user_id", both.id)
    expect(remove.error?.code).toBe("42501")
    const org = await bothDb.from("orgs").insert({ slug: `x-${orgs.suffix}`, name: "X", prefix: `x${orgs.suffix}`, host: `x-${orgs.suffix}.test` })
    expect(org.error?.code).toBe("42501")
    const journal = await bothDb.from("journal").select("id").limit(1)
    expect(journal.error?.code).toBe("42501")
    expect(await memberRows()).toHaveLength(3)
  })

  it("clé publique sans jeton : refusée dès le schéma (42501), rien de lu", async () => {
    const anon = anonDb()
    // `anon` n'a pas l'usage du schéma : « permission denied for schema oauth_test », pas une liste vide.
    const results = [
      await anon.from("orgs").select("id").limit(1),
      await anon.from("members").select("user_id").limit(1),
      await anon.from("journal").select("id").limit(1),
    ]
    for (const { data, error } of results) {
      expect(error?.code).toBe("42501")
      expect(data).toBeNull()
    }
  })

  it("isMember : par la seule RLS, relu à chaque appel (retrait puis ajout, même jeton)", async () => {
    expect(await isMember(bothDb, acme().id)).toBe(true)
    expect(await isMember(bothDb, delta().id)).toBe(true)
    expect(await isMember(acmeOnlyDb, acme().id)).toBe(true)
    expect(await isMember(acmeOnlyDb, delta().id)).toBe(false)
    expect(await isMember(noneDb, acme().id)).toBe(false)

    expect(await setMember(db, delta().slug, both.email, "remove")).toBe(true)
    expect(await isMember(bothDb, delta().id)).toBe(false)
    expect(await setMember(db, delta().slug, both.email, "add")).toBe(true)
    expect(await isMember(bothDb, delta().id)).toBe(true)
  })

  it("flushJournal : une ligne par entrée, défauts appliqués, jeton résumé sans autre clé", async () => {
    const raw = `eyJ.${orgs.suffix}.signature`
    const token = summarizeClaims({
      iss: "https://example.supabase.co/auth/v1",
      aud: "authenticated",
      sub: both.id,
      email: both.email,
      client_id: "client-vitest",
      session_id: "session-vitest",
      iat: 1_790_000_000,
      exp: 1_790_003_600,
      amr: [{ method: "password", timestamp: 1_790_000_000 }],
      scope: "openid email",
      role: "authenticated",
      raw,
      access_token: raw,
    })
    const entries: JournalEntry[] = [
      {
        host: acme().host,
        path: "/api/auth-test/mcp",
        method: "tools/call",
        tool: `${acme().prefix}_whoami`,
        decision: "allowed",
        user_id: both.id,
        email: both.email,
        org_slug: acme().slug,
        client_id: "client-vitest",
        token,
        user_agent: "vitest",
      },
      // `ts` posé sur une seule entrée : l'autre doit garder le défaut now(), pas null.
      { ts: "2026-01-01T00:00:00Z", host: acme().host, path: "/api/auth-test/mcp", method: "POST", decision: "unauthenticated", reason: "missing", ip: "127.0.0.1" },
    ]
    await flushJournal(db, entries)

    const rows = (await db.from("journal").select("*").eq("host", acme().host).order("id")).data ?? []
    expect(rows.map((r) => r.decision)).toEqual(["allowed", "unauthenticated"])
    expect(rows[0].ts).toBeTruthy()
    expect(rows[0]).toMatchObject({ tool: `${acme().prefix}_whoami`, user_id: both.id, org_slug: acme().slug, reason: null })
    expect(Object.keys(rows[0].token ?? {}).sort()).toEqual([...CLAIM_KEYS].sort())
    expect(JSON.stringify(rows)).not.toContain(raw)
  })

  it("flushJournal : un échec d'écriture est journalisé, jamais levé", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    // Décision hors du check de la migration, que le type interdit : la base refuse le lot.
    const refused = { host: acme().host, decision: "bogus" } as unknown as JournalEntry
    await expect(flushJournal(db, [refused])).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it("proto.orgs reste lisible avec la clé secrète : l'exposition PostgREST garde proto", async () => {
    const env = readEnv()
    const proto = createClient<ProtoDatabase, "proto">(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
      db: { schema: "proto" },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await proto.from("orgs").select("id").limit(1)
    expect(error).toBeNull()
  })
})
