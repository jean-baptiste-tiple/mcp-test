// @vitest-environment node
// Route /api/proto/u/<utilisateur>/mcp : réponses JSON-RPC quand l'utilisateur est inconnu ou la
// base injoignable (E04-S01). La base est simulée : on teste la route, pas les services.
import { describe, expect, it, vi } from "vitest"

const resolveIdentity = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({ getProtoClient: () => ({}) }))
vi.mock("@/proto/identity", () => ({ resolveIdentity: (...args: unknown[]) => resolveIdentity(...args) }))

const { POST, GET } = await import("@/app/api/proto/u/[user]/[transport]/route")

function post(user: string) {
  const request = new Request(`http://localhost/api/proto/u/${user}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })
  return POST(request, { params: Promise.resolve({ user, transport: "mcp" }) })
}

describe("route proto", () => {
  it("utilisateur inconnu : 404 et erreur JSON-RPC « Unknown user »", async () => {
    resolveIdentity.mockResolvedValueOnce(null)
    const response = await post("personne")
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown user" } })
  })

  it("base injoignable : 503 et erreur JSON-RPC, pas une page d'erreur", async () => {
    resolveIdentity.mockRejectedValueOnce(new Error("down"))
    const response = await post("jb")
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: -32603, message: "Proto store unavailable" } })
  })

  it("GET : 405, stateless sans flux SSE", () => {
    expect(GET().status).toBe(405)
  })
})
