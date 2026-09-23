// Journal des consentements (FR-AUTH-07, ADR-004 §7) : une ligne `consent` par affichage de la page et par
// décision, écrite par la page et par ses actions. Sans ce module, les deux écriraient deux formes de ligne.
// Il ne peut pas vivre dans actions.ts : toute fonction exportée d'un fichier "use server" devient un point
// d'entrée appelable depuis le navigateur, qui pourrait alors écrire au journal.
import { headers } from "next/headers"
import type { OAuthAuthorizationDetails, User } from "@supabase/supabase-js"

import { flushJournal, type JournalEntry } from "@/auth-test/journal"
import { requestHost } from "@/auth-test/orgs"
import { getOauthTestClient } from "@/lib/supabase/admin"

export type ConsentStage = "shown" | "approved" | "denied" | "auto"

/** Ce que le journal et la marque retiennent de la requête. */
export type ConsentRequest = { host: string; userAgent: string | null }

/** Hôte que l'utilisateur voit, lu comme la route MCP le lit (requestHost), et navigateur de la requête. */
export async function requestInfo(): Promise<ConsentRequest> {
  const h = await headers()
  return { host: requestHost(h), userAgent: h.get("user-agent") }
}

type ConsentSource = {
  user: User
  /** requestInfo(), lu une fois par la page ou l'action qui journalise. */
  request: ConsentRequest
  /** Ce que getAuthorizationDetails a rendu ; absent quand Supabase a déjà décidé (stage `auto`). */
  details?: OAuthAuthorizationDetails | null
  /** Adresse de retour complète rendue par Supabase : le code et le state y sont, seul le chemin est gardé. */
  redirectUrl?: string
}

/**
 * Écrit la ligne avec la clé secrète (ADR-004 §6) et ne lève jamais : un journal en panne ne bloque ni la
 * page ni la décision. Jamais l'authorization_id, jamais un code.
 */
export async function logConsent(stage: ConsentStage, { user, request, details, redirectUrl }: ConsentSource): Promise<void> {
  const { host, userAgent } = request
  // Supabase omet name, uri et logo_uri quand le client ne les a pas déclarés (omitempty) : null explicite.
  const client = details
    ? {
        id: details.client.id,
        name: details.client.name ?? null,
        uri: details.client.uri ?? null,
        logo_uri: details.client.logo_uri ?? null,
      }
    : null
  const entry: JournalEntry = {
    decision: "consent",
    host: host || null,
    user_id: user.id,
    email: user.email ?? null,
    user_agent: userAgent,
    client_id: client?.id ?? null,
    client_name: client?.name ?? null,
    consent: {
      stage,
      client,
      redirect_uri: details?.redirect_uri ?? (redirectUrl ? redirectUrl.split(/[?#]/)[0] : null),
      scope: details?.scope ?? null,
    },
  }

  try {
    await flushJournal(getOauthTestClient(), [entry])
  } catch (error) {
    // getOauthTestClient lève sans clé secrète ; flushJournal, lui, ne lève jamais.
    console.error("[consent] journal", error)
  }
}
