// Endpoint du serveur auth-test (E03, architecture §10.4, ADR-004) : /api/auth-test/mcp, servi sur chaque
// hôte d'organisation (Acme, Delta). Ce fichier branche les dépendances réelles sur src/auth-test/http.ts :
// client à clé secrète (organisation par hôte, journal), JWKS du projet Supabase, after(). Sans lui, aucun
// host ne reçoit de 401 ni ne peut se connecter.
//
// Public par construction (aucun middleware sur /api/*) : l'auth est ici, withMcpAuth, jamais de mode anonyme.
import { after } from "next/server"

import { getOauthTestClient } from "@/lib/supabase/admin"
import { handleMcpPost, handleMcpRefused, type HostDeps } from "@/auth-test/http"
import { flushJournal } from "@/auth-test/journal"
import { resolveOrg } from "@/auth-test/orgs"
import { makeVerifyToken } from "@/auth-test/token"

export const maxDuration = 60
export const dynamic = "force-dynamic"

function hostDeps(): HostDeps {
  const db = getOauthTestClient()
  return {
    resolveOrg: (host) => resolveOrg(db, host),
    // Dans after() : les outils s'exécutent pendant le flux du corps, leurs lignes arrivent après le return.
    journal: (entries) => after(() => flushJournal(db, entries)),
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpPost(request, { ...hostDeps(), verifyToken: makeVerifyToken() })
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRefused(request, hostDeps())
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRefused(request, hostDeps())
}
