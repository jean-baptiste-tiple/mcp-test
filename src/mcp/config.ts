// Constantes du canal MCP. Phase 1 : serveur public, aucun issuer ni scope OAuth (ADR-002).

export const MCP_SERVER_INFO = {
  name: "mcp-bench", // nom court, stable à jamais (les hosts s'y réfèrent)
  title: "MCP Bench", // affiché dans les UI des hosts
  version: "0.1.0", // bump à CHAQUE évolution de surface (tools, descriptions, schemas)
} as const
