// Tests du serveur MCP via InMemoryTransport (mcp-patterns §10) : pas de HTTP, pas de mock
// du SDK — un vrai client connecté au vrai serveur, alimenté par MemoryBenchRepository.
// Chaque `connect()` rejoue ce que fait la route : un snapshot relu, un serveur reconstruit.
import { beforeAll, describe, it, expect } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"

import type { ToolOutcome } from "@/mcp/bench/context"
import { fingerprintFrom, parseRpcBody } from "@/mcp/bench/events"
import { applyLever } from "@/mcp/bench/levers"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { buildServerOptions, installBenchHandlers } from "@/mcp/server"

import { makeScenario, makeTool } from "../factories/bench.factory"

// Sans secret explicite, getAckSecret() retombe sur "dev-secret" avec un avertissement :
// le test resterait vert mais bruyant, et dépendrait de l'environnement de la machine.
beforeAll(() => {
  process.env.BENCH_ACK_SECRET = "test-secret"
})

type ConnectOptions = { headers?: Headers; now?: () => Date }

async function connect(repo: MemoryBenchRepository, connectOptions: ConnectOptions = {}) {
  const snapshot = await loadSnapshot(repo)
  const { serverInfo, ...options } = buildServerOptions(snapshot)
  const server = new McpServer(serverInfo, options)

  const headers = connectOptions.headers ?? new Headers()
  const outcomes = new Map<string, ToolOutcome>()
  installBenchHandlers(server, snapshot, {
    repo,
    headers,
    fingerprint: fingerprintFrom(headers),
    now: connectOptions.now ?? (() => new Date()),
    outcomes,
  })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test-client", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  return { client, snapshot, outcomes }
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
    expect(event.response_chars).toBe(JSON.stringify(applyLever(snapshot).tools).length)
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

  it("bench_mutate fait parvenir notifications/tools/list_changed au client", async () => {
    const repo = new MemoryBenchRepository(makeScenario(), [
      makeTool({ name: "bench_mutate", handler: "mutate", sort_order: 30 }),
    ])
    const { client, outcomes } = await connect(repo)

    const received: string[] = []
    client.setNotificationHandler(ToolListChangedNotificationSchema, (notification) => {
      received.push(notification.method)
    })

    const result = await client.callTool({ name: "bench_mutate", arguments: { action: "bump_version" } })

    expect(result.isError).toBeFalsy()
    expect(received).toEqual(["notifications/tools/list_changed"])
    expect([...outcomes.values()]).toEqual([{ listChangedSent: true }])
    expect(repo.scenario?.server_version).toBe("1.0.1")
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

describe("serveur MCP — levier readme de bout en bout", () => {
  const readmeScenario = () =>
    makeScenario({
      slug: "readme_ack",
      readme_lever: "ack",
      readme_content: "Read me first. [C:readme_ack:readme:start:a001]",
      ack_ttl_seconds: 60,
      instructions: "MCP Bench: a test server.",
    })

  const readmeTools = () => [
    makeTool({ name: "bench_readme", handler: "readme", sort_order: 40 }),
    makeTool({ name: "bench_echo", sort_order: 20 }),
  ]

  function ackFrom(result: Awaited<ReturnType<Client["callTool"]>>): string {
    const [block] = result.content as { type: string; text: string }[]
    const match = /ack: (\S+)$/m.exec(block.text)
    if (!match) throw new Error(`pas d'ack dans : ${block.text}`)
    return match[1]
  }

  it("readme → ack → echo : l'appel passe, et sans ack il est refusé", async () => {
    const repo = new MemoryBenchRepository(readmeScenario(), readmeTools())
    const { client, outcomes } = await connect(repo)

    const listed = (await client.listTools()).tools
    expect(listed.find((tool) => tool.name === "bench_echo")?.inputSchema.required).toEqual(["ack"])

    const readme = await client.callTool({ name: "bench_readme", arguments: {} })
    const ack = ackFrom(readme)
    expect(ack).toHaveLength(12)

    const passed = await client.callTool({ name: "bench_echo", arguments: { message: "x", ack } })
    expect(passed.isError).toBeFalsy()
    expect(passed.structuredContent).toEqual({ args: { message: "x", ack } })

    const refused = await client.callTool({ name: "bench_echo", arguments: { message: "x" } })
    expect(refused.isError).toBe(true)
    const [block] = refused.content as { type: string; text: string }[]
    expect(block.text).toBe("Call bench_readme first and pass its ack.")

    // L'erreur doit être VISIBLE du journal : c'est elle qui compte la mesure.
    expect([...outcomes.values()].some((outcome) => outcome.isError === true)).toBe(true)
  })

  it("name_first renomme le readme, le met en tête et le rend appelable sous ce nom", async () => {
    const repo = new MemoryBenchRepository(
      makeScenario({ readme_lever: "name_first", readme_content: "Read me." }),
      readmeTools()
    )
    const { client } = await connect(repo)

    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(["bench_00_readme", "bench_echo"])

    const result = await client.callTool({ name: "bench_00_readme", arguments: {} })
    expect(result.isError).toBeFalsy()
    const [block] = result.content as { type: string; text: string }[]
    expect(block.text).toContain("Read me.")
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
