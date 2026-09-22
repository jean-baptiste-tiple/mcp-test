// Constantes du canal MCP. Phase 1 : serveur public, aucun issuer ni scope OAuth (ADR-002).

// serverInfo servi quand AUCUN scénario n'est actif en base (snapshot vide, architecture §6).
// Version 0.0.0 = signal explicite côté host : « le banc tourne, mais il ne sert rien ».
// Dès qu'un scénario est actif, name/title/version viennent de `bench_scenarios`.
export const FALLBACK_SERVER_INFO = {
  name: "mcp-bench", // nom court, stable à jamais (les hosts s'y réfèrent)
  title: "MCP Bench", // affiché dans les UI des hosts
  version: "0.0.0",
} as const

// instructions du snapshot vide : en ANGLAIS comme celles des scénarios (mcp-patterns §2.1).
export const FALLBACK_INSTRUCTIONS = "No active scenario"

// Plafonds (architecture §7). Sans eux, un host peut pousser un argument de plusieurs Mo :
// la réponse d'echo le renvoie tel quel et la ligne de journal le stocke.
export const MAX_TOOL_ARGS_BYTES = 64 * 1024 // arguments acceptés par un handler
export const MAX_LOGGED_ARGS_BYTES = 8 * 1024 // `args` stockés dans bench_events

// L'endpoint est public et sans rate limiting (ADR-002 §6) : un seul POST peut porter un
// batch JSON-RPC de taille arbitraire. Sans ce plafond, une requête suffit à saturer
// bench_events — la table même qui sert à dépouiller les mesures.
export const MAX_EVENTS_PER_REQUEST = 100
