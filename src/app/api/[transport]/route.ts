// ⚠️ Le dossier est bien `src/app/api/[transport]` (PAS `src/app/api/mcp/[transport]`) :
// avec basePath "/api", mcp-handler sert le transport Streamable HTTP NATIVEMENT sur
// /api/mcp — l'URL canonique donnée aux hosts. Un niveau de dossier en trop = 404 même
// avec un token valide (bug vécu). Les routes statiques (/api/…) restent prioritaires.
import { after } from "next/server"
import { createMcpHandler } from "mcp-handler"

import { getAdminClient } from "@/lib/supabase/admin"
import { logEvents, parseRpcBody } from "@/mcp/bench/events"
import { SupabaseBenchRepository } from "@/mcp/bench/repository"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { buildServerOptions, installBenchHandlers } from "@/mcp/server"

// maxDuration : couvrir la plus longue opération d'un tool (jamais > 60 s → pattern
// "job + tool de statut", voir mcp-patterns §7).
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Transport STATELESS figé par ADR-001 : pas de session, pas de Redis. Le handler est
// reconstruit à CHAQUE requête parce que serverInfo, instructions et tools sortent du
// snapshot lu à cette requête-là (architecture §6). mcp-handler instancie de toute façon un
// McpServer par requête ; le coût ajouté est la fermeture, et son timer de nettoyage est
// global au module, pas par appel — vérifié dans dist/index.mjs avant de figer ce choix.
async function handleMcpRequest(request: Request): Promise<Response> {
  const repo = new SupabaseBenchRepository(getAdminClient())

  // Cloner AVANT : mcp-handler consomme le body (req.json()), et un stream ne se lit
  // qu'une fois. GET/DELETE n'ont pas de body (mcp-handler y répond 405).
  const rawBody = request.method === "POST" ? await request.clone().text() : ""

  const snapshot = await loadSnapshot(repo)

  const handler = createMcpHandler(
    (server) => installBenchHandlers(server, snapshot),
    buildServerOptions(snapshot),
    {
      basePath: "/api", // → endpoint exposé sur /api/mcp
      maxDuration: 60,
      disableSse: true, // stateless : pas de flux SSE ni de session
      verboseLogs: process.env.NODE_ENV !== "production",
    }
  )

  const response = await handler(request)

  // Journal APRÈS la réponse : le banc mesure la latence du serveur, pas celle de son
  // journal. Si `after()` devait un jour être indisponible ici, le repli est
  // `await logEvents(...)` avant le return (architecture, point d'attention n°3).
  const events = parseRpcBody(rawBody, request.headers, snapshot)
  after(() => logEvents(repo, events))

  return response
}

// ── Auth OAuth 2.1 — HORS PÉRIMÈTRE PHASE 1 (ADR-002 §1 et §4 : endpoint public) ──
// Réactivation en E03, où l'auth devient une variable de test : envelopper
// `handleMcpRequest` dans `withMcpAuth` après avoir ajouté src/mcp/auth.ts (starter mcp),
// la route /.well-known/oauth-protected-resource, et réintroduit `MCP_RESOURCE_URL` dans
// src/mcp/config.ts (retiré en S01 : plus aucun consommateur).

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request)
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request)
}
