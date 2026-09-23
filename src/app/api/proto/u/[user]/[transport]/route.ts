// Endpoint du serveur proto (E04, architecture §9) : /api/proto/u/<utilisateur>/mcp.
// ⚠️ Aucune authentification : l'utilisateur EST le segment d'URL (ADR-003). Données fictives
// seulement ; ce n'est pas un exemple de produit.
//
// Stateless (ADR-001) : identité relue et handler reconstruit à chaque requête, parce que les noms
// des outils et leurs descriptions dépendent de l'organisation de l'utilisateur.
import { after } from "next/server"
import { createMcpHandler } from "mcp-handler"

import { getProtoClient } from "@/lib/supabase/admin"
import { STORE_UNAVAILABLE } from "@/proto/db"
import { type Identity, resolveIdentity } from "@/proto/identity"
import { buildServerOptions, installProto, type ProtoDeps } from "@/proto/mcp/server"
import { flushJournal, initializeEntries, type JournalEntry } from "@/proto/services/journal"

export const maxDuration = 60
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ user: string; transport: string }> }

function rpcError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status })
}

async function handlePost(request: Request, { params }: Params): Promise<Response> {
  const { user } = await params
  const db = getProtoClient()

  let identity: Identity | null
  try {
    identity = await resolveIdentity(db, user)
  } catch {
    // Base injoignable : une erreur JSON-RPC que le host sait lire, pas une page 500 de Next.
    return rpcError(503, -32603, STORE_UNAVAILABLE)
  }
  if (!identity) return rpcError(404, -32001, "Unknown user")

  const rawBody = await request.clone().text()
  const userAgent = request.headers.get("user-agent")
  const journal: JournalEntry[] = initializeEntries(rawBody).map((clientName) => ({
    method: "initialize",
    org_id: identity.org.id,
    user_id: identity.user.id,
    user_agent: userAgent,
    client_name: clientName,
  }))
  const deps: ProtoDeps = { db, identity, userAgent, journal }

  const handler = createMcpHandler((server) => installProto(server, deps), buildServerOptions(identity), {
    basePath: `/api/proto/u/${identity.user.slug}`, // → endpoint /api/proto/u/<utilisateur>/mcp
    maxDuration: 60,
    disableSse: true,
    verboseLogs: process.env.NODE_ENV !== "production",
  })

  const response = await handler(request)
  // Dans after() : les outils s'exécutent pendant le streaming du corps (constat du banc, S03).
  after(() => flushJournal(db, journal))
  return response
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

export function GET(): Response {
  return methodNotAllowed()
}

export function DELETE(): Response {
  return methodNotAllowed()
}

export async function POST(request: Request, context: Params): Promise<Response> {
  return handlePost(request, context)
}
