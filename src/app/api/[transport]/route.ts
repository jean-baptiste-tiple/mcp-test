// ⚠️ Le dossier est bien `src/app/api/[transport]` (PAS `src/app/api/mcp/[transport]`) :
// avec basePath "/api", mcp-handler sert le transport Streamable HTTP NATIVEMENT sur
// /api/mcp — l'URL canonique donnée aux hosts. Un niveau de dossier en trop = 404 même
// avec un token valide (bug vécu). Les routes statiques (/api/…) restent prioritaires.
import { after } from "next/server"
import { createMcpHandler } from "mcp-handler"

import { getAdminClient } from "@/lib/supabase/admin"
import type { BenchRequestContext, ToolOutcome } from "@/mcp/bench/context"
import { applyOutcomes, fingerprintFrom, httpEvent, logEvents, parseRpcBody } from "@/mcp/bench/events"
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
async function handleMcpPost(request: Request): Promise<Response> {
  const repo = new SupabaseBenchRepository(getAdminClient())

  // Cloner AVANT : mcp-handler consomme le body (req.json()), et un stream ne se lit
  // qu'une fois.
  const rawBody = await request.clone().text()

  const snapshot = await loadSnapshot(repo)

  // Rempli PENDANT l'exécution des tools, relu après : ce que le body JSON-RPC ne dit pas
  // (notification envoyée, erreur servie) n'a pas d'autre chemin vers le journal.
  const outcomes = new Map<string, ToolOutcome>()
  const ctx: BenchRequestContext = {
    repo,
    headers: request.headers,
    fingerprint: fingerprintFrom(request.headers),
    now: () => new Date(),
    outcomes,
  }

  const handler = createMcpHandler(
    (server) => installBenchHandlers(server, snapshot, ctx),
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
  //
  // `applyOutcomes` est DANS le callback, pas avant : mcp-handler rend sa Response dès
  // l'écriture des en-têtes et les tools s'exécutent pendant le streaming du corps. Fusionner
  // ici laisserait list_changed_sent et is_error toujours vides (vérifié en base).
  const events = parseRpcBody(rawBody, request.headers, snapshot)
  after(() => {
    applyOutcomes(events, outcomes)
    return logEvents(repo, events)
  })

  return response
}

/**
 * GET et DELETE : mcp-handler y répond 405 de toute façon (stateless, `disableSse`). On
 * journalise la tentative — « ce host a essayé d'ouvrir le flux SSE » est une mesure du banc
 * (E02) — puis on répond directement, SANS charger le snapshot : il n'y a rien à servir.
 */
function rejectNonPost(request: Request, method: "GET" | "DELETE"): Response {
  const repo = new SupabaseBenchRepository(getAdminClient())
  after(() => logEvents(repo, [httpEvent(method, request.headers)]))

  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

// ── Auth OAuth 2.1 — HORS PÉRIMÈTRE PHASE 1 (ADR-002 §1 et §4 : endpoint public) ──
// Réactivation en E03, où l'auth devient une variable de test : envelopper
// `handleMcpPost` dans `withMcpAuth` après avoir ajouté src/mcp/auth.ts (starter mcp),
// la route /.well-known/oauth-protected-resource, et réintroduit `MCP_RESOURCE_URL` dans
// src/mcp/config.ts (retiré en S01 : plus aucun consommateur).

export function GET(request: Request): Response {
  return rejectNonPost(request, "GET")
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpPost(request)
}

export function DELETE(request: Request): Response {
  return rejectNonPost(request, "DELETE")
}
