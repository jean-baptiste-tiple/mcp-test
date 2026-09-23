// Métadonnées RFC 9728 du serveur auth-test, par hôte (E03, ADR-004 §2) : racine et variante suffixée
// /api/auth-test/mcp, logique dans src/auth-test/http.ts. Sans elles, le 401 de /api/auth-test/mcp désigne
// une adresse vide : aucun host ne découvre le serveur d'autorisation Supabase, la connexion OAuth ne
// démarre jamais. Hors du middleware (S03) : publiques par construction.
import { after } from "next/server"
import { metadataCorsOptionsRequestHandler } from "mcp-handler"

import { getOauthTestClient } from "@/lib/supabase/admin"
import { handleMetadata } from "@/auth-test/http"
import { flushJournal } from "@/auth-test/journal"
import { resolveOrg } from "@/auth-test/orgs"
import { projectIssuer } from "@/auth-test/token"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const db = getOauthTestClient()
  return handleMetadata(request, {
    resolveOrg: (host) => resolveOrg(db, host),
    journal: (entries) => after(() => flushJournal(db, entries)),
    issuer: projectIssuer(),
  })
}

// Préflight CORS des clients qui lisent les métadonnées depuis un navigateur.
export const OPTIONS = metadataCorsOptionsRequestHandler()
