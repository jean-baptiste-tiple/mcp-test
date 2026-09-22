// Snapshot et registre : ce qu'un host VOIT (tools/list) et ce qu'il OBTIENT (tools/call),
// sans MCP ni HTTP. Le passage par le vrai protocole est dans mcp-server.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest"

import { applyLever } from "@/mcp/bench/levers"
import { dispatchToolCall } from "@/mcp/bench/registry"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { MAX_TOOL_ARGS_BYTES } from "@/mcp/config"

import { makeScenario, makeTool, makeToolContext } from "../factories/bench.factory"

const scenario = makeScenario()

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("loadSnapshot", () => {
  it("ne garde que les tools activés, triés par sort_order", async () => {
    const repo = new MemoryBenchRepository(scenario, [
      makeTool({ name: "bench_c", sort_order: 2 }),
      makeTool({ name: "bench_a", sort_order: 0 }),
      makeTool({ name: "bench_off", sort_order: 1, enabled: false }),
      makeTool({ name: "bench_b", sort_order: 1 }),
    ])

    const snapshot = await loadSnapshot(repo)

    expect(snapshot.tools.map((t) => t.name)).toEqual(["bench_a", "bench_b", "bench_c"])
  })

  it("expose le serverInfo et les instructions du scénario actif", async () => {
    const repo = new MemoryBenchRepository(
      makeScenario({ server_version: "2.4.0", instructions: "Do the thing." }),
      []
    )

    const snapshot = await loadSnapshot(repo)

    expect(snapshot.serverInfo).toEqual({ name: "mcp-bench", title: "MCP Bench", version: "2.4.0" })
    expect(snapshot.instructions).toBe("Do the thing.")
  })

  it("retourne un snapshot vide quand aucun scénario n'est actif", async () => {
    const snapshot = await loadSnapshot(new MemoryBenchRepository())

    expect(snapshot.scenario).toBeNull()
    expect(snapshot.tools).toEqual([])
    expect(snapshot.serverInfo).toEqual({ name: "mcp-bench", title: "MCP Bench", version: "0.0.0" })
    expect(snapshot.instructions).toBe("No active scenario")
  })
})

// Levier `none` : `applyLever` est alors l'identité, donc c'est bien la transformation
// lignes → Tool[] qui est mesurée ici.
describe("tools servis (levier none)", () => {
  it("sert name, title, description, inputSchema et annotations tels quels, sans _meta", async () => {
    const inputSchema = {
      type: "object",
      properties: { message: { type: "string", description: "Text to echo back" } },
    }
    const annotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    const repo = new MemoryBenchRepository(scenario, [
      makeTool({
        name: "bench_echo",
        title: "Echo",
        description: "Returns its arguments unchanged.",
        input_schema: inputSchema,
        annotations,
      }),
    ])

    const [tool] = applyLever(await loadSnapshot(repo)).tools

    expect(tool).toEqual({
      name: "bench_echo",
      title: "Echo",
      description: "Returns its arguments unchanged.",
      inputSchema,
      annotations,
    })
    expect(tool).not.toHaveProperty("_meta")
  })

  it("omet title et annotations quand les colonnes sont nulles", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_bare" })])

    const [tool] = applyLever(await loadSnapshot(repo)).tools

    expect(Object.keys(tool)).toEqual(["name", "description", "inputSchema"])
  })
})

describe("dispatchToolCall", () => {
  it("echo renvoie la sérialisation exacte des arguments dans les deux formes", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])
    const args = { message: "x", extra: 1 }

    const result = await dispatchToolCall(await loadSnapshot(repo), "bench_echo", args, makeToolContext())

    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(args) }])
    expect(result.structuredContent).toEqual({ args })
  })

  it("echo refuse des arguments au-delà du plafond avec un message actionnable", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])
    const args = { message: "x".repeat(MAX_TOOL_ARGS_BYTES + 1) }

    const result = await dispatchToolCall(await loadSnapshot(repo), "bench_echo", args, makeToolContext())

    expect(result.isError).toBe(true)
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toContain(`limit is ${MAX_TOOL_ARGS_BYTES}`)
    expect(block.text).toContain("Retry with shorter argument values.")
  })

  it("un tool inconnu répond isError, sans exception", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])

    const result = await dispatchToolCall(await loadSnapshot(repo), "ghost_tool", {}, makeToolContext())

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool ghost_tool. Call tools/list to refresh." },
    ])
  })

  it("transforme une erreur de configuration serveur en résultat MCP isError", async () => {
    // Secret absent en production : `getAckSecret()` JETTE. Sans filet, l'agent reçoit une
    // erreur de protocole opaque et le journal ne garde aucune trace de la panne.
    vi.stubEnv("BENCH_ACK_SECRET", "")
    vi.stubEnv("NODE_ENV", "production")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = new MemoryBenchRepository(makeScenario({ readme_lever: "ack" }), [
      makeTool({ name: "bench_echo" }),
    ])
    const ctx = makeToolContext()

    const result = await dispatchToolCall(await loadSnapshot(repo), "bench_echo", {}, ctx)

    expect(result.isError).toBe(true)
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toBe(
      "Server misconfiguration: BENCH_ACK_SECRET missing. Ask the operator to check BENCH_ACK_SECRET."
    )
    expect(consoleError).toHaveBeenCalled()
    expect([...ctx.outcomes.values()][0]?.isError).toBe(true)
  })

  it("un tool listé dont le handler n'est pas implémenté répond isError", async () => {
    const repo = new MemoryBenchRepository(scenario, [
      makeTool({ name: "bench_ghost", handler: "ghost" }),
    ])

    const result = await dispatchToolCall(await loadSnapshot(repo), "bench_ghost", {}, makeToolContext())

    expect(result.isError).toBe(true)
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toContain('handler "ghost" is not implemented')
  })
})
