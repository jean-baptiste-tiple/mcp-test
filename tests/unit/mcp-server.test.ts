// Tests du serveur MCP via InMemoryTransport (mcp-patterns §10) : pas de HTTP, pas de mock
// du SDK — un vrai client connecté au vrai serveur.
import { describe, it, expect, beforeAll } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { initializeMcpServer, mcpServerOptions } from "@/mcp/server"

describe("serveur MCP", () => {
  let client: Client

  beforeAll(async () => {
    const server = new McpServer(mcpServerOptions.serverInfo, {
      instructions: mcpServerOptions.instructions,
    })
    initializeMcpServer(server)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: "test-client", version: "0.0.0" })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  })

  it("s'annonce comme mcp-bench avec un title et des instructions non vides", () => {
    const info = client.getServerVersion()
    expect(info?.name).toBe("mcp-bench")
    expect(info?.title).toBe("MCP Bench")
    expect(client.getInstructions()).toBeTruthy()
  })

  it("expose get_status dans tools/list", async () => {
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === "get_status")

    expect(tool).toBeDefined()
    expect(tool?.description).toContain("Use this when")
    expect(tool?.annotations?.readOnlyHint).toBe(true)
  })

  it("retourne les deux formes : content texte + structuredContent (§4)", async () => {
    const result = await client.callTool({ name: "get_status", arguments: { verbose: true } })

    expect(result.isError).toBeFalsy()
    const content = result.content as { type: string; text: string }[]
    expect(content[0]?.type).toBe("text")
    expect(content[0]?.text).toContain("mcp-bench")

    const structured = result.structuredContent as { product: string; status: string }
    expect(structured.product).toBe("mcp-bench")
    expect(structured.status).toBe("ok")
  })
})
