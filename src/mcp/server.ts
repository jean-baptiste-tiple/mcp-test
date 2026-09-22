// Assemblage du serveur MCP à partir d'un snapshot — partagé entre la route /api/mcp
// (mcp-handler) et les tests unit (InMemoryTransport). Aucun tool n'est écrit ici : ils
// viennent de `bench_tools` (ADR-002 §2).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import { dispatchToolCall, toToolList } from "./bench/registry"
import type { BenchSnapshot } from "./bench/snapshot"

/** Options du serveur pour CE snapshot (passées telles quelles à createMcpHandler). */
export function buildServerOptions(snapshot: BenchSnapshot) {
  return {
    serverInfo: snapshot.serverInfo,
    // instructions = "system prompt" du serveur injecté chez l'host (mcp-patterns §2.1).
    // Ici c'est une donnée de scénario : la faire varier est le test.
    instructions: snapshot.instructions,
    // Déclaré EXPLICITEMENT (ADR-001 §Neutres) : sans registerTool, plus personne ne le
    // fait, et le SDK refuse setRequestHandler(tools/*) si la capability est absente.
    capabilities: { tools: { listChanged: true } },
  }
}

/**
 * Pose les deux handlers BAS NIVEAU sur `server.server`. Pas de `registerTool` : il
 * installerait ses propres handlers tools/list et tools/call, et imposerait un schéma Zod
 * par tool — alors que le banc doit servir le JSON Schema brut de la base.
 */
export function installBenchHandlers(server: McpServer, snapshot: BenchSnapshot): void {
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toToolList(snapshot),
  }))

  server.server.setRequestHandler(CallToolRequestSchema, (request) =>
    dispatchToolCall(snapshot, request.params.name, request.params.arguments ?? {})
  )
}
