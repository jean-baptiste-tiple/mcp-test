// Tests du serveur MCP via InMemoryTransport (mcp-patterns §10) : pas de HTTP, pas de mock
// du SDK — un vrai client connecté au vrai serveur, alimenté par MemoryBenchRepository.
// Chaque `connect()` rejoue ce que fait la route : un snapshot relu, un serveur reconstruit.
import { describe, it, expect } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { parseRpcBody } from "@/mcp/bench/events"
import { toToolList } from "@/mcp/bench/registry"
import { MemoryBenchRepository } from "@/mcp/bench/repository"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { buildServerOptions, installBenchHandlers } from "@/mcp/server"

import { makeScenario, makeTool } from "../factories/bench.factory"

async function connect(repo: MemoryBenchRepository) {
  const snapshot = await loadSnapshot(repo)
  const { serverInfo, ...options } = buildServerOptions(snapshot)
  const server = new McpServer(serverInfo, options)
  installBenchHandlers(server, snapshot)

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test-client", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  return { client, snapshot }
}

describe("serveur MCP — scénario actif", () => {
  it("s'annonce avec le serverInfo et les instructions du scénario", async () => {
    const repo = new MemoryBenchRepository(
      makeScenario({ server_version: "1.0.0", instructions: "MCP Bench: a test server." }),
      []
    )

    const { client } = await connect(repo)

    expect(client.getServerVersion()).toMatchObject({
      name: "mcp-bench",
      title: "MCP Bench",
      version: "1.0.0",
    })
    expect(client.getInstructions()).toBe("MCP Bench: a test server.")
    expect(client.getServerCapabilities()?.tools).toEqual({ listChanged: true })
  })

  it("ne liste que les tools activés, dans l'ordre sort_order, avec leurs métadonnées", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [
      makeTool({ name: "bench_c", sort_order: 2 }),
      makeTool({ name: "bench_off", sort_order: 1, enabled: false }),
      makeTool({
        name: "bench_echo",
        sort_order: 0,
        title: "Echo",
        description: "Returns its arguments unchanged.",
        input_schema: {
          type: "object",
          properties: { message: { type: "string", description: "Text to echo back" } },
        },
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      }),
      makeTool({ name: "bench_b", sort_order: 1 }),
    ])

    const { client } = await connect(repo)
    const { tools } = await client.listTools()

    expect(tools.map((t) => t.name)).toEqual(["bench_echo", "bench_b", "bench_c"])
    expect(tools[0]).toMatchObject({
      title: "Echo",
      description: "Returns its arguments unchanged.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", description: "Text to echo back" } },
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    })
  })

  it("sert la nouvelle description dès la requête suivante (aucun cache)", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [
      makeTool({ name: "bench_echo", description: "Version A." }),
    ])

    const first = await connect(repo)
    expect((await first.client.listTools()).tools[0].description).toBe("Version A.")

    repo.tools[0] = { ...repo.tools[0], description: "Version B." }

    const second = await connect(repo)
    expect((await second.client.listTools()).tools[0].description).toBe("Version B.")
  })

  it("compte tools_served et response_chars sur la liste réellement servie", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [
      makeTool({ name: "bench_echo", description: "Returns its arguments unchanged." }),
      makeTool({ name: "bench_b", sort_order: 1 }),
    ])

    const { client, snapshot } = await connect(repo)
    const { tools } = await client.listTools()

    const [event] = parseRpcBody(
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      new Headers(),
      snapshot
    )

    expect(event.tools_served).toBe(tools.length)
    expect(event.response_chars).toBe(JSON.stringify(toToolList(snapshot)).length)
  })

  it("bench_echo renvoie ses arguments dans les deux formes", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [makeTool({ name: "bench_echo" })])

    const { client } = await connect(repo)
    const result = await client.callTool({
      name: "bench_echo",
      arguments: { message: "x", extra: 1 },
    })

    expect(result.isError).toBeFalsy()
    const content = result.content as { type: string; text: string }[]
    expect(content[0].text).toBe(JSON.stringify({ message: "x", extra: 1 }))
    expect(result.structuredContent).toEqual({ args: { message: "x", extra: 1 } })
  })

  it("un tool inconnu remonte isError, pas une erreur de protocole", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [makeTool({ name: "bench_echo" })])

    const { client } = await connect(repo)
    const result = await client.callTool({ name: "ghost_tool", arguments: {} })

    expect(result.isError).toBe(true)
    const content = result.content as { type: string; text: string }[]
    expect(content[0].text).toBe("Unknown tool ghost_tool. Call tools/list to refresh.")
  })
})

describe("serveur MCP — aucun scénario actif", () => {
  it("s'annonce en 0.0.0 avec « No active scenario » et zéro tool", async () => {
    const { client } = await connect(new MemoryBenchRepository())

    expect(client.getServerVersion()).toMatchObject({ name: "mcp-bench", version: "0.0.0" })
    expect(client.getInstructions()).toBe("No active scenario")
    expect((await client.listTools()).tools).toEqual([])
  })
})
