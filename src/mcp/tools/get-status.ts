// Tool DÉMO — forme canonique d'un tool (mcp-patterns §1, §3, §4) : adaptateur FIN
// (validation → service → mise en forme), zéro logique métier ici.
// Remplacé en S02 par les handlers du banc (tools = lignes en base, ADR-002).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { GetStatusInput } from "@/lib/schemas/status"
import { getStatus } from "@/lib/services/status-service"
import { toToolResult, toolError } from "@/mcp/tool-result"

// Format imposé (§3) : verbe d'abord, "Use this when…", "Do not use for…",
// l'essentiel dans la première phrase. Stable (prompt caching des hosts).
const GET_STATUS_DESC = `Returns the server's health status and version.
Use this when the user asks whether the service is up, which version is deployed,
or to verify the connection after setup. Do not use for bench measurements (use the
bench tools instead). Returns {product, version, status} plus per-component
details when verbose is true.`

export function registerGetStatusTool(server: McpServer) {
  server.registerTool(
    "get_status", // verb_noun, stable À JAMAIS (§3, §10)
    {
      title: "État du service",
      description: GET_STATUS_DESC,
      inputSchema: GetStatusInput.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      // Pas de `_meta` : ni widget ni securitySchemes en phase 1 (ADR-002 §4).
    },
    async (input) => {
      try {
        const result = await getStatus(input)

        return toToolResult({
          text: `${result.product} v${result.version} — status: ${result.status}.`,
          structured: { ...result, next_actions: [] },
        })
      } catch {
        // Jamais de throw brut : instruction de récupération pour l'agent (§4)
        return toolError(
          "Status check failed. Retry in a few seconds; if it persists, the service is down."
        )
      }
    }
  )
}
