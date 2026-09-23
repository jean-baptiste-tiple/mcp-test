// @vitest-environment node
// Métadonnées RFC 9728 par hôte (E03-S02, FR-AUTH-02) sans réseau : racine, variante suffixée et variante
// réécrite (sous la ressource), 404 d'un hôte inconnu ou d'une autre ressource, CORS, OPTIONS, une ligne de
// journal par lecture.
import { describe, expect, it, vi } from "vitest"

import { STORE_UNAVAILABLE } from "@/auth-test/db"
import { handleMetadata, type MetadataDeps } from "@/auth-test/http"
import type { JournalEntry } from "@/auth-test/journal"

import { ACME_ORG, ORGS_BY_HOST, TEST_ISSUER } from "../factories/oauth-test.factory"

// La route importe le client à clé secrète (`server-only`), que Vitest ne charge pas ; OPTIONS n'y touche pas.
vi.mock("@/lib/supabase/admin", () => ({ getOauthTestClient: () => ({}) }))

const ACME_HOST = ACME_ORG.host
const ROOT = "/.well-known/oauth-protected-resource"
const SUFFIXED = `${ROOT}/api/auth-test/mcp`
/** Ce que la route reçoit de la réécriture de next.config.ts : l'URL d'origine, pas la destination. */
const REWRITTEN = `/api/auth-test/mcp${ROOT}`

function setup(resolveOrg: MetadataDeps["resolveOrg"] = async (host) => ORGS_BY_HOST[host] ?? null) {
  const batches: JournalEntry[][] = []
  const deps: MetadataDeps = { resolveOrg, issuer: TEST_ISSUER, journal: (entries) => void batches.push(entries) }
  return { deps, journal: () => batches.flat() }
}

function get(host: string, path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { "x-forwarded-host": host, "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" },
  })
}

describe("métadonnées par hôte", () => {
  for (const [host, org] of Object.entries(ORGS_BY_HOST)) {
    for (const path of [ROOT, SUFFIXED, REWRITTEN]) {
      it(`${host}${path} : ressource et documentation de cet hôte, Supabase du banc, CORS ouvert, lecture journalisée`, async () => {
        const { deps, journal } = setup()
        const response = await handleMetadata(get(host, path), deps)

        expect(response.status).toBe(200)
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        expect(await response.json()).toEqual({
          resource: `https://${host}/api/auth-test/mcp`,
          authorization_servers: [TEST_ISSUER],
          scopes_supported: ["openid", "email", "profile", "offline_access"],
          bearer_methods_supported: ["header"],
          resource_documentation: `https://${host}/auth-test/grants`,
        })
        expect(journal()).toEqual([
          { host, path, method: "GET", decision: "metadata", org_slug: org.slug, user_agent: "vitest", ip: "203.0.113.7" },
        ])
      })
    }
  }

  it("les trois formes d'URL rendent la même chose", async () => {
    const { deps } = setup()
    const root = await (await handleMetadata(get(ACME_HOST, ROOT), deps)).json()
    const suffixed = await (await handleMetadata(get(ACME_HOST, SUFFIXED), deps)).json()
    const rewritten = await (await handleMetadata(get(ACME_HOST, REWRITTEN), deps)).json()
    expect(suffixed).toEqual(root)
    expect(rewritten).toEqual(root)
  })
})

describe("refus", () => {
  it("hôte inconnu : 404, lecture journalisée avec son motif", async () => {
    const { deps, journal } = setup()
    const response = await handleMetadata(get("inconnu.example.test", SUFFIXED), deps)

    expect(response.status).toBe(404)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(journal()).toEqual([expect.objectContaining({ host: "inconnu.example.test", decision: "metadata", reason: "unknown_host" })])
    expect(journal()[0]).not.toHaveProperty("org_slug")
  })

  it("autre ressource que /api/auth-test/mcp : 404", async () => {
    const { deps, journal } = setup()
    const response = await handleMetadata(get(ACME_HOST, `${ROOT}/api/mcp`), deps)

    expect(response.status).toBe(404)
    expect(journal()).toEqual([expect.objectContaining({ path: `${ROOT}/api/mcp`, org_slug: ACME_ORG.slug, reason: "unknown_path" })])
  })

  it("base injoignable : 503 JSON, lecture journalisée", async () => {
    const { deps, journal } = setup(async () => {
      throw new Error(STORE_UNAVAILABLE)
    })
    const response = await handleMetadata(get(ACME_HOST, ROOT), deps)

    expect(response.status).toBe(503)
    expect(journal()).toEqual([expect.objectContaining({ decision: "metadata", reason: "store_unavailable" })])
  })
})

describe("OPTIONS (route)", () => {
  it("préflight CORS : GET et OPTIONS permis, toute origine", async () => {
    const { OPTIONS } = await import("@/app/.well-known/oauth-protected-resource/[[...path]]/route")
    const response = OPTIONS()

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
  })
})
