// Journal et hôte du serveur auth-test sans base (E03-S01) : ce que le journal et whoami gardent d'un jeton
// (ces claims-là, jamais le jeton ni une autre clé : NFR-AUTH-01), la forme d'hôte qui désigne une
// organisation, et un journal qui n'échoue jamais.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OauthTestDb } from "@/auth-test/db"
import { flushJournal, summarizeClaims, type JournalEntry, type TokenSummary } from "@/auth-test/journal"
import { normalizeHost, resolveOrg } from "@/auth-test/orgs"

const CLAIM_KEYS = ["iss", "aud", "sub", "email", "client_id", "session_id", "iat", "exp", "amr", "scope"]
const RAW = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl"

const CLAIMS = {
  iss: "https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1",
  aud: "authenticated",
  sub: "5f0c1d7e-0000-4000-8000-000000000001",
  email: "someone@example.test",
  client_id: "client-123",
  session_id: "session-456",
  iat: 1_790_000_000,
  exp: 1_790_003_600,
  amr: [{ method: "password", timestamp: 1_790_000_000 }],
  scope: "openid email",
}

// Jeton d'accès Supabase (docs 2026-09-23), plus ce qui ne doit jamais atteindre le journal.
const PAYLOAD = {
  ...CLAIMS,
  role: "authenticated",
  aal: "aal1",
  phone: "",
  is_anonymous: false,
  user_metadata: { email_verified: true },
  app_metadata: { provider: "email" },
  raw: RAW,
  access_token: RAW,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("summarizeClaims", () => {
  it("garde les claims admises, telles quelles", () => {
    expect(summarizeClaims(PAYLOAD)).toEqual(CLAIMS)
  })

  it("refuse toute autre clé, dont raw et access_token : le jeton n'y apparaît jamais", () => {
    const summary = summarizeClaims(PAYLOAD)

    expect(Object.keys(summary).filter((key) => !CLAIM_KEYS.includes(key))).toEqual([])
    expect(summary).not.toHaveProperty("raw")
    expect(summary).not.toHaveProperty("access_token")
    expect(JSON.stringify(summary)).not.toContain(RAW)
  })

  it("écarte une valeur d'un autre type que prévu", () => {
    expect(summarizeClaims({ sub: { token: RAW }, email: 42, exp: "demain", aud: [1, 2], amr: "password" })).toEqual({})
    expect(summarizeClaims({ aud: ["a", "b"] })).toEqual({ aud: ["a", "b"] })
  })

  it("amr : garde les seuls éléments { method, timestamp }, sans autre clé", () => {
    const amr = [{ method: "password", timestamp: 1 }, { method: "otp" }, { method: 2, timestamp: 3 }, "totp", null, { method: "oauth", timestamp: 4, token: RAW }]

    expect(summarizeClaims({ amr })).toEqual({ amr: [{ method: "password", timestamp: 1 }, { method: "oauth", timestamp: 4 }] })
    expect(JSON.stringify(summarizeClaims({ amr }))).not.toContain(RAW)
  })

  it("idempotent : un résumé repassé au filtre revient tel quel", () => {
    expect(summarizeClaims(summarizeClaims(PAYLOAD))).toEqual(CLAIMS)
  })

  it("rend un résumé vide pour ce qui n'est pas un objet", () => {
    for (const value of [null, undefined, RAW, 42, [PAYLOAD]]) {
      expect(summarizeClaims(value)).toEqual({})
    }
  })
})

describe("normalizeHost", () => {
  it("minuscules, sans port, sans espaces", () => {
    expect(normalizeHost("MCP-Test-Acme.Vercel.App")).toBe("mcp-test-acme.vercel.app")
    expect(normalizeHost("mcp-test-acme.vercel.app:443")).toBe("mcp-test-acme.vercel.app")
    expect(normalizeHost("  localhost:3000 ")).toBe("localhost")
  })

  it("absent ou vide : chaîne vide", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(normalizeHost(value)).toBe("")
    }
  })
})

describe("resolveOrg", () => {
  function recordingDb() {
    const calls: string[] = []
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        calls.push(`${column}=${value}`)
        return query
      },
      maybeSingle: async () => ({ data: null, error: null }),
    }
    const from = vi.fn((table: string) => {
      calls.push(table)
      return query
    })
    return { db: { from } as unknown as OauthTestDb, calls, from }
  }

  it("une seule requête, sur l'hôte normalisé", async () => {
    const { db, calls } = recordingDb()

    expect(await resolveOrg(db, " MCP-Test-Acme.vercel.app:443 ")).toBeNull()
    expect(calls).toEqual(["orgs", "host=mcp-test-acme.vercel.app"])
  })

  it("hôte absent : null sans requête", async () => {
    const { db, from } = recordingDb()

    expect(await resolveOrg(db, null)).toBeNull()
    expect(await resolveOrg(db, "  ")).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it("une panne de la base : erreur sans nom de table ni message PostgREST ; console : code et message, jamais details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = { code: "XX000", message: 'relation "orgs" is down', details: "Failing row contains (someone@example.test)", hint: "" }
    const failing = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error }) }) }) }),
    } as unknown as OauthTestDb

    await expect(resolveOrg(failing, "acme.test")).rejects.toThrow(/^Auth-test store unavailable$/)
    expect(spy).toHaveBeenCalledWith("[auth-test] resolveOrg", { code: "XX000", message: 'relation "orgs" is down' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain("someone@example.test")
  })
})

describe("flushJournal", () => {
  const entry: JournalEntry = { host: "acme.test", path: "/.well-known/oauth-protected-resource", method: "GET", decision: "metadata" }

  it("rien à écrire : aucune requête", async () => {
    const from = vi.fn()

    await flushJournal({ from } as unknown as OauthTestDb, [])
    expect(from).not.toHaveBeenCalled()
  })

  it("une erreur de la base ou une exception : console.error, jamais levée", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const failing = { from: () => ({ insert: async () => ({ error: { message: "down" } }) }) } as unknown as OauthTestDb
    const throwing = {
      from: () => {
        throw new Error("network")
      },
    } as unknown as OauthTestDb

    await expect(flushJournal(failing, [entry])).resolves.toBeUndefined()
    await expect(flushJournal(throwing, [entry])).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("erreur PostgREST : code et message en console, jamais details (la ligne refusée)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = { code: "23514", message: "check violation", details: "Failing row contains (someone@example.test, 127.0.0.1)", hint: "" }
    const failing = { from: () => ({ insert: async () => ({ error }) }) } as unknown as OauthTestDb

    await flushJournal(failing, [entry])
    expect(spy).toHaveBeenCalledWith("[auth-test] journal", { code: "23514", message: "check violation" })
    expect(JSON.stringify(spy.mock.calls)).not.toContain("someone@example.test")
  })

  it("repasse token au filtre : un payload entier forcé en TokenSummary n'écrit que les dix claims admises", async () => {
    const insert = vi.fn<(rows: JournalEntry[]) => Promise<{ error: null }>>(async () => ({ error: null }))
    const db = { from: () => ({ insert }) } as unknown as OauthTestDb

    await flushJournal(db, [{ ...entry, token: PAYLOAD as unknown as TokenSummary }, entry])

    expect(insert).toHaveBeenCalledOnce()
    const [[rows]] = insert.mock.calls
    expect(Object.keys(rows[0].token ?? {}).sort()).toEqual([...CLAIM_KEYS].sort())
    expect(rows[1]).toEqual(entry)
    expect(JSON.stringify(rows)).not.toContain(RAW)
  })
})
