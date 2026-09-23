// @vitest-environment node
// POST, GET, DELETE /api/auth-test/mcp sans réseau (E03-S02, architecture §10.6) : 404 d'un hôte inconnu,
// 401 par hôte (absent, autre clé, expiré, autre émetteur, illisible, sans `sub`, JWKS en panne) avec le
// `resource_metadata` de l'hôte appelé et le motif au journal seulement, jeton valide jusqu'au handler MCP,
// refus du transport (corps illisible, Accept incomplet) journalisés, lots plafonnés, 405. Organisation et
// journal injectés, JWKS locale : c'est la vraie chaîne mcp-handler (withMcpAuth, createMcpHandler) qui répond.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { STORE_UNAVAILABLE } from "@/auth-test/db"
import { handleMcpPost, handleMcpRefused, type McpDeps } from "@/auth-test/http"
import { rpcCalls, type JournalEntry } from "@/auth-test/journal"
import { requestHost } from "@/auth-test/orgs"
import { makeVerifyToken, type VerifyToken } from "@/auth-test/token"

import { ACME_ORG, DELTA_ORG, ORGS_BY_HOST, TEST_ISSUER } from "../factories/oauth-test.factory"

const ACME_HOST = ACME_ORG.host
const DELTA_HOST = DELTA_ORG.host
const USER_ID = "5f0c1d7e-0000-4000-8000-000000000001"
const URL_MCP = "http://localhost/api/auth-test/mcp"
const UNKNOWN_HOST = "inconnu.example.test"

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "0.1.0" } },
}
const TOOLS_LIST = { jsonrpc: "2.0", id: 2, method: "tools/list" }

/** Colonnes de requête communes à toutes les lignes d'un POST de ce fichier. */
const request = (host: string) => ({ host, path: "/api/auth-test/mcp", user_agent: "vitest", ip: "203.0.113.7" })
const metadataUrl = (host: string) => `https://${host}/.well-known/oauth-protected-resource/api/auth-test/mcp`

let signingKey: CryptoKey
let otherKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const signing = await generateKeyPair("ES256")
  const other = await generateKeyPair("ES256")
  signingKey = signing.privateKey
  otherKey = other.privateKey
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(signing.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const now = () => Math.floor(Date.now() / 1000)

/** Jeton au format Supabase ; la clé, l'émetteur, l'expiration et le `sub` (null : absent) varient selon le cas. */
function token({
  key = signingKey,
  issuer = TEST_ISSUER,
  exp = now() + 3600,
  sub = USER_ID,
}: { key?: CryptoKey; issuer?: string; exp?: number; sub?: string | null } = {}) {
  const jwt = new SignJWT({ email: "someone@example.test", role: "authenticated", client_id: "client-123", session_id: "session-456", amr: [{ method: "password", timestamp: exp - 3600 }] })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt(exp - 3600)
    .setExpirationTime(exp)
  if (sub !== null) jwt.setSubject(sub)
  return jwt.sign(key)
}

function setup(
  resolveOrg: McpDeps["resolveOrg"] = async (host) => ORGS_BY_HOST[host] ?? null,
  verifyToken: VerifyToken = makeVerifyToken({ jwks, issuer: TEST_ISSUER })
) {
  const batches: JournalEntry[][] = []
  const deps: McpDeps = {
    resolveOrg,
    verifyToken,
    journal: (entries) => {
      batches.push(entries) // le tableau lui-même : les outils y écrivent pendant le flux
    },
  }
  return { deps, journal: () => batches.flat() }
}

/** `raw` : corps envoyé tel quel (JSON illisible) ; sinon `body` sérialisé. */
function post(
  host: string,
  { bearer, body = INITIALIZE, raw, accept = "application/json, text/event-stream" }: { bearer?: string; body?: unknown; raw?: string; accept?: string } = {}
) {
  const headers = new Headers({
    "content-type": "application/json",
    accept,
    "x-forwarded-host": host,
    "user-agent": "vitest",
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
  })
  if (bearer) headers.set("authorization", `Bearer ${bearer}`)
  return new Request(URL_MCP, { method: "POST", headers, body: raw ?? JSON.stringify(body) })
}

/** Premier message JSON-RPC d'une réponse, SSE (`data: …`) ou JSON ; lit tout le corps. */
async function rpcMessage(response: Response): Promise<unknown> {
  const text = await response.text()
  const data = text.split("\n").find((line) => line.startsWith("data: "))
  return JSON.parse(data ? data.slice("data: ".length) : text)
}

/** Colonnes d'une ligne au jeton vérifié de `token()`, sur l'hôte Acme. */
const admitted = () => ({
  ...request(ACME_HOST),
  org_slug: ACME_ORG.slug,
  user_id: USER_ID,
  email: "someone@example.test",
  client_id: "client-123",
  token: expect.objectContaining({ iss: TEST_ISSUER, sub: USER_ID }),
})

describe("hôte inconnu", () => {
  it("404 JSON-RPC « Unknown host », rien d'autre, une ligne unknown_host ; même avec un jeton valide", async () => {
    const { deps, journal } = setup()
    const response = await handleMcpPost(post(UNKNOWN_HOST, { bearer: await token() }), deps)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown host" }, id: null })
    expect(journal()).toEqual([{ ...request(UNKNOWN_HOST), method: "initialize", decision: "unknown_host" }])
  })

  it("base injoignable : 503 JSON-RPC, pas une page d'erreur", async () => {
    const { deps, journal } = setup(async () => {
      throw new Error(STORE_UNAVAILABLE)
    })
    const response = await handleMcpPost(post(ACME_HOST), deps)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: -32603, message: STORE_UNAVAILABLE } })
    expect(journal()).toEqual([])
  })
})

describe("401 par hôte", () => {
  for (const host of [ACME_HOST, DELTA_HOST]) {
    it(`${host} sans jeton : 401 invalid_token, resource_metadata de cet hôte, ligne unauthenticated (missing)`, async () => {
      const { deps, journal } = setup()
      const response = await handleMcpPost(post(host), deps)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: "invalid_token", error_description: "No authorization provided" })
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="${metadataUrl(host)}"`
      )
      expect(journal()).toEqual([{ ...request(host), method: "initialize", decision: "unauthenticated", reason: "missing" }])
    })

    const rejected = [
      { reason: "signature", bearer: () => token({ key: otherKey }) },
      { reason: "expired", bearer: () => token({ exp: now() - 60 }) },
      { reason: "issuer", bearer: () => token({ issuer: "https://other-ref.supabase.co/auth/v1" }) },
      { reason: "malformed", bearer: async () => "not-a-jwt" },
      { reason: "claims", bearer: () => token({ sub: null }) },
    ]
    for (const { reason, bearer: make } of rejected) {
      it(`${host}, jeton refusé (${reason}) : 401 sans motif pour le client, ligne invalid_token sans identité ni jeton`, async () => {
        const { deps, journal } = setup()
        const bearer = await make()
        const response = await handleMcpPost(post(host, { bearer }), deps)

        expect(response.status).toBe(401)
        expect(response.headers.get("www-authenticate")).toBe(
          `Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="${metadataUrl(host)}"`
        )
        expect(await response.text()).not.toContain(reason)
        expect(journal()).toEqual([{ ...request(host), method: "initialize", decision: "invalid_token", reason }])
        expect(JSON.stringify(journal())).not.toContain(bearer)
      })
    }
  }

  it("JWKS injoignable : 401, motif error au journal, panne en console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const down: JWTVerifyGetKey = async () => {
      throw new Error("down")
    }
    const { deps, journal } = setup(undefined, makeVerifyToken({ jwks: down, issuer: TEST_ISSUER }))
    const response = await handleMcpPost(post(ACME_HOST, { bearer: await token() }), deps)

    expect(response.status).toBe(401)
    expect(journal()).toEqual([{ ...request(ACME_HOST), method: "initialize", decision: "invalid_token", reason: "error" }])
    expect(spy).toHaveBeenCalledWith("[auth-test] vérification du jeton", expect.any(Error))
  })

  it("un corps sans message JSON-RPC : une ligne à la méthode HTTP", async () => {
    const { deps, journal } = setup()
    const response = await handleMcpPost(post(ACME_HOST, { body: "pas du json-rpc" }), deps)

    expect(response.status).toBe(401)
    expect(journal()).toEqual([{ ...request(ACME_HOST), method: "POST", decision: "unauthenticated", reason: "missing" }])
  })

  it("lot de 150 ping sans jeton : 100 lignes au plus, troncature signalée en console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { deps, journal } = setup()
    const pings = Array.from({ length: 150 }, (_, id) => ({ jsonrpc: "2.0", id, method: "ping" }))
    const response = await handleMcpPost(post(ACME_HOST, { body: pings }), deps)

    expect(response.status).toBe(401)
    expect(journal()).toHaveLength(100)
    expect(journal()[0]).toEqual({ ...request(ACME_HOST), method: "ping", decision: "unauthenticated", reason: "missing" })
    expect(warn).toHaveBeenCalledWith("[auth-test] lot tronqué", { received: 150, kept: 100 })
  })
})

describe("jeton valide", () => {
  it("initialize : serverInfo et instructions de l'organisation de l'hôte ; ligne allowed avec le client annoncé", async () => {
    const { deps, journal } = setup()
    const bearer = await token()
    const response = await handleMcpPost(post(ACME_HOST, { bearer }), deps)

    expect(response.status).toBe(200)
    expect(await rpcMessage(response)).toMatchObject({
      result: {
        serverInfo: { name: `${ACME_ORG.slug}-auth-test`, title: `${ACME_ORG.name} (auth test)`, version: "1.0.0" },
        instructions: expect.stringContaining(`${ACME_ORG.prefix}_whoami`),
      },
    })
    expect(journal()).toEqual([
      {
        ...request(ACME_HOST),
        method: "initialize",
        client_name: "claude-ai@0.1.0",
        decision: "allowed",
        org_slug: ACME_ORG.slug,
        user_id: USER_ID,
        email: "someone@example.test",
        client_id: "client-123",
        token: expect.objectContaining({ iss: TEST_ISSUER, sub: USER_ID, aud: "authenticated", session_id: "session-456" }),
      },
    ])
    expect(JSON.stringify(journal())).not.toContain(bearer)
  })

  it("exp dépassé de 2 s, dans la tolérance d'horloge (5 s) : accepté", async () => {
    const { deps, journal } = setup()
    const response = await handleMcpPost(post(ACME_HOST, { bearer: await token({ exp: now() - 2 }) }), deps)

    expect(response.status).toBe(200)
    expect(journal()).toEqual([expect.objectContaining({ method: "initialize", decision: "allowed", user_id: USER_ID })])
  })

  it("tools/list sur Delta : les deux outils préfixés delta ; ligne tools/list écrite pendant le flux", async () => {
    const { deps, journal } = setup()
    const bearer = await token()
    const response = await handleMcpPost(post(DELTA_HOST, { bearer, body: TOOLS_LIST }), deps)

    expect(response.status).toBe(200)
    expect(await rpcMessage(response)).toMatchObject({
      result: { tools: [{ name: `${DELTA_ORG.prefix}_whoami` }, { name: `${DELTA_ORG.prefix}_echo` }] },
    })
    expect(journal()).toEqual([
      expect.objectContaining({ ...request(DELTA_HOST), method: "tools/list", decision: "allowed", org_slug: DELTA_ORG.slug, user_id: USER_ID }),
    ])
  })

  it("notification : acceptée, une ligne allowed à sa méthode", async () => {
    const { deps, journal } = setup()
    const body = { jsonrpc: "2.0", method: "notifications/initialized" }
    const response = await handleMcpPost(post(ACME_HOST, { bearer: await token(), body }), deps)

    expect(response.status).toBe(202)
    expect(journal()).toEqual([expect.objectContaining({ method: "notifications/initialized", decision: "allowed", org_slug: ACME_ORG.slug })])
  })
})

describe("refus du transport, jeton valide", () => {
  it("corps JSON illisible : 400 Parse error sans attendre mcp-handler, une ligne parse_error avec l'identité", async () => {
    const { deps, journal } = setup()
    const response = await handleMcpPost(post(ACME_HOST, { bearer: await token(), raw: "{pas du json" }), deps)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null })
    expect(journal()).toEqual([{ ...admitted(), method: "POST", decision: "denied_not_member", reason: "parse_error" }])
  })

  it("Accept sans text/event-stream : 406, chaque message journalisé refusé (http_406), jamais allowed", async () => {
    const { deps, journal } = setup()
    const bearer = await token()

    const initialize = await handleMcpPost(post(ACME_HOST, { bearer, accept: "application/json" }), deps)
    const list = await handleMcpPost(post(ACME_HOST, { bearer, accept: "application/json", body: TOOLS_LIST }), deps)

    expect([initialize.status, list.status]).toEqual([406, 406])
    expect(journal()).toEqual([
      { ...admitted(), method: "initialize", client_name: "claude-ai@0.1.0", decision: "denied_not_member", reason: "http_406" },
      { ...admitted(), method: "tools/list", client_name: null, decision: "denied_not_member", reason: "http_406" },
    ])
  })
})

describe("GET et DELETE", () => {
  for (const method of ["GET", "DELETE"]) {
    it(`${method} : 405 sur un hôte connu (pas de flux SSE), 404 journalisé sur un hôte inconnu`, async () => {
      const { deps, journal } = setup()
      const known = await handleMcpRefused(new Request(URL_MCP, { method, headers: { "x-forwarded-host": ACME_HOST } }), deps)
      expect(known.status).toBe(405)
      expect(known.headers.get("allow")).toBe("POST")
      expect(journal()).toEqual([])

      const unknown = await handleMcpRefused(new Request(URL_MCP, { method, headers: { "x-forwarded-host": UNKNOWN_HOST } }), deps)
      expect(unknown.status).toBe(404)
      expect(journal()).toEqual([expect.objectContaining({ host: UNKNOWN_HOST, method, decision: "unknown_host" })])
    })
  }
})

describe("lecture de la requête", () => {
  it("requestHost : x-forwarded-host d'abord (premier élément), sinon host ; normalisé", () => {
    expect(requestHost(new Headers({ "x-forwarded-host": "MCP-Test-Acme.vercel.app:443, proxy.internal", host: "localhost:3000" }))).toBe(
      "mcp-test-acme.vercel.app"
    )
    expect(requestHost(new Headers({ host: "Delta.example.test:3000" }))).toBe("delta.example.test")
    expect(requestHost(new Headers())).toBe("")
  })

  it("rpcCalls : un message, un lot, un corps illisible (null), une réponse ; valeurs tronquées et nettoyées", () => {
    const initialized = { jsonrpc: "2.0", method: "notifications/initialized" }
    expect(rpcCalls(JSON.stringify(INITIALIZE))).toEqual([{ method: "initialize", client_name: "claude-ai@0.1.0" }])
    expect(rpcCalls(JSON.stringify([INITIALIZE, initialized]))).toEqual([
      { method: "initialize", client_name: "claude-ai@0.1.0" },
      { method: "notifications/initialized", client_name: null },
    ])
    expect(rpcCalls("{pas du json")).toBeNull()
    expect(rpcCalls("")).toBeNull()
    expect(rpcCalls(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }))).toEqual([])
    expect(rpcCalls(JSON.stringify({ method: "initialize", params: {} }))).toEqual([{ method: "initialize", client_name: null }])
    expect(rpcCalls(JSON.stringify({ method: "x".repeat(500) }))?.[0].method).toHaveLength(100)
    // NUL et surrogate isolé (refusés par Postgres) retirés ; le plafond (200) coupe entre deux emojis.
    expect(rpcCalls(JSON.stringify({ method: "tools/\u0000list\ud800" }))).toEqual([{ method: "tools/list", client_name: null }])
    const client = { method: "initialize", params: { clientInfo: { name: `\ud800${"🙂".repeat(250)}`, version: "1" } } }
    expect(rpcCalls(JSON.stringify(client))).toEqual([{ method: "initialize", client_name: "🙂".repeat(200) }])
  })
})
