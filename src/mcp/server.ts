// Assemblage du serveur MCP à partir d'un snapshot — partagé entre la route /api/mcp
// (mcp-handler) et les tests unit (InMemoryTransport). Aucun tool n'est écrit ici : ils
// viennent de `bench_tools` (ADR-002 §2).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import type { BenchRequestContext } from "./bench/context"
import { applyLever } from "./bench/levers"
import { dispatchToolCall } from "./bench/registry"
import type { BenchSnapshot } from "./bench/snapshot"

/** Options du serveur pour CE snapshot (passées telles quelles à createMcpHandler). */
export function buildServerOptions(snapshot: BenchSnapshot) {
  return {
    serverInfo: snapshot.serverInfo,
    // instructions = "system prompt" du serveur injecté chez l'host (mcp-patterns §2.1).
    // Ici c'est une donnée de scénario, servie APRÈS le levier readme : le levier
    // `instructions` n'existe que s'il traverse l'initialize (architecture §6).
    instructions: applyLever(snapshot).instructions,
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
export function installBenchHandlers(
  server: McpServer,
  snapshot: BenchSnapshot,
  ctx: BenchRequestContext
): void {
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: applyLever(snapshot).tools,
  }))

  server.server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
    // `requestId` est l'id JSON-RPC de CET appel : il recolle l'outcome à la ligne de
    // journal (`rpc_id`) et adresse le flux de réponse pour la notification list_changed.
    dispatchToolCall(snapshot, request.params.name, request.params.arguments ?? {}, {
      ...ctx,
      server,
      requestId: extra.requestId,
    })
  )
}
