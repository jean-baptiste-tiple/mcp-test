// Snapshot et registre : ce qu'un host VOIT (tools/list) et ce qu'il OBTIENT (tools/call),
// sans MCP ni HTTP. Le passage par le vrai protocole est dans mcp-server.test.ts.
import { describe, expect, it } from "vitest"

import { dispatchToolCall, toToolList } from "@/mcp/bench/registry"
import { MemoryBenchRepository } from "@/mcp/bench/repository"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { MAX_TOOL_ARGS_BYTES } from "@/mcp/config"

import { makeScenario, makeTool } from "../factories/bench.factory"

const scenario = makeScenario()

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

describe("toToolList", () => {
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

    const [tool] = toToolList(await loadSnapshot(repo))

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

    const [tool] = toToolList(await loadSnapshot(repo))

    expect(Object.keys(tool)).toEqual(["name", "description", "inputSchema"])
  })
})

describe("dispatchToolCall", () => {
  it("echo renvoie la sérialisation exacte des arguments dans les deux formes", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])
    const args = { message: "x", extra: 1 }

    const result = dispatchToolCall(await loadSnapshot(repo), "bench_echo", args)

    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(args) }])
    expect(result.structuredContent).toEqual({ args })
  })

  it("echo refuse des arguments au-delà du plafond avec un message actionnable", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])
    const args = { message: "x".repeat(MAX_TOOL_ARGS_BYTES + 1) }

    const result = dispatchToolCall(await loadSnapshot(repo), "bench_echo", args)

    expect(result.isError).toBe(true)
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toContain(`limit is ${MAX_TOOL_ARGS_BYTES}`)
    expect(block.text).toContain("Retry with shorter argument values.")
  })

  it("un tool inconnu répond isError, sans exception", async () => {
    const repo = new MemoryBenchRepository(scenario, [makeTool({ name: "bench_echo" })])

    const result = dispatchToolCall(await loadSnapshot(repo), "ghost_tool", {})

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool ghost_tool. Call tools/list to refresh." },
    ])
  })

  it("un tool listé dont le handler n'est pas implémenté répond isError", async () => {
    const repo = new MemoryBenchRepository(scenario, [
      makeTool({ name: "bench_whoami", handler: "whoami" }),
    ])

    const result = dispatchToolCall(await loadSnapshot(repo), "bench_whoami", {})

    expect(result.isError).toBe(true)
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toContain('handler "whoami" is not implemented')
  })
})
