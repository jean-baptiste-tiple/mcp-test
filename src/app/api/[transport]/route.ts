// ⚠️ Le dossier est bien `src/app/api/[transport]` (PAS `src/app/api/mcp/[transport]`) :
// avec basePath "/api", mcp-handler sert le transport Streamable HTTP NATIVEMENT sur
// /api/mcp — l'URL canonique donnée aux hosts. Un niveau de dossier en trop = 404 même
// avec un token valide (bug vécu). Les routes statiques (/api/…) restent prioritaires.
import { createMcpHandler } from "mcp-handler"

import { initializeMcpServer, mcpServerOptions } from "@/mcp/server"

// maxDuration : couvrir la plus longue opération d'un tool (jamais > 60 s → pattern
// "job + tool de statut", voir mcp-patterns §7).
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Transport STATELESS figé par ADR-001 : pas de session, pas de Redis, chaque requête
// reconstruit le serveur. Le passage stateful (phase 2, mesure de `list_changed`) passe
// par un amendement de l'ADR — pas par un diff de config.
const handler = createMcpHandler(initializeMcpServer, mcpServerOptions, {
  basePath: "/api", // → endpoint exposé sur /api/mcp
  maxDuration: 60,
  disableSse: true, // stateless : pas de flux SSE ni de session
  verboseLogs: process.env.NODE_ENV !== "production",
})

// ── Auth OAuth 2.1 — HORS PÉRIMÈTRE PHASE 1 (ADR-002 §1 et §4 : endpoint public) ──
// Réactivation en E03, où l'auth devient une variable de test : décommenter ce bloc
// après avoir ajouté src/mcp/auth.ts (starter mcp), la route
// /.well-known/oauth-protected-resource, et réintroduit `MCP_RESOURCE_URL` dans
// src/mcp/config.ts (retiré en S01 : plus aucun consommateur).
//
// import { withMcpAuth } from "mcp-handler"
// import { verifyToken } from "@/mcp/auth"
//
// const authHandler = withMcpAuth(handler, verifyToken, {
//   required: true,
//   resourceMetadataPath: "/.well-known/oauth-protected-resource",
//   resourceUrl: MCP_RESOURCE_URL,
// })
// export { authHandler as GET, authHandler as POST, authHandler as DELETE }

export { handler as GET, handler as POST, handler as DELETE }
