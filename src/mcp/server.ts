// Assemblage du serveur MCP — partagé entre la route /api/mcp (mcp-handler) et les tests
// unit (InMemoryTransport). C'est le SEUL endroit qui liste tools et instructions.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { MCP_SERVER_INFO } from "./config"
import { registerGetStatusTool } from "./tools/get-status"

// instructions = le "system prompt" du serveur, injecté chez l'host (mcp-patterns §2.1).
// En ANGLAIS (robustesse cross-host), JAMAIS de contenu variable (prompt caching de l'host).
// Provisoires : en S02 elles viennent du scénario actif en base (architecture §6).
const SERVER_INSTRUCTIONS = `MCP Bench: test server. Call get_status.`

/** Options passées à createMcpHandler (serverInfo + instructions). */
export const mcpServerOptions = {
  serverInfo: MCP_SERVER_INFO,
  instructions: SERVER_INSTRUCTIONS,
  // Pas de `capabilities` : le SDK déclare lui-même `tools.listChanged` au premier
  // `registerTool` (ADR-001 §Neutres).
}

/** Callback d'initialisation : enregistre les tools. */
export function initializeMcpServer(server: McpServer): void {
  // Tool démo du starter, remplacé par les tools du banc en S02 (tools = lignes en base).
  registerGetStatusTool(server)
}
