"use server"

// Décisions de /oauth/consent (E03-S03, ADR-004 §7) : Autoriser ou Refuser, rendus au serveur OAuth de
// Supabase, puis retour à l'assistant par l'adresse que Supabase donne. Sans elles, la page montre la
// demande sans pouvoir y répondre : aucun host ne reçoit de code.
import { redirect } from "next/navigation"

import { authorizationIdSchema, consentPath, loginPath } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

import { logConsent, requestInfo } from "./consent-journal"

// Type seul, effacé à la compilation : permis dans un fichier "use server" (ConsentForm l'importe).
export type Decision = "approve" | "deny"

const FAILED: Record<Decision, string> = {
  approve: "L’autorisation n’a pas abouti. Rechargez la page, puis réessayez.",
  deny: "Le refus n’a pas abouti. Rechargez la page, puis réessayez.",
}

/** Refuser après un consentement donné ailleurs (autre onglet) : Supabase n'a plus de demande à refuser. */
const ALREADY_GRANTED =
  "Cet assistant est déjà autorisé : la demande ne peut plus être refusée. Retirez-lui l’accès depuis la page des clients autorisés."

export async function approve(authorizationId: string): Promise<{ error: string }> {
  return decide("approve", authorizationId)
}

export async function deny(authorizationId: string): Promise<{ error: string }> {
  return decide("deny", authorizationId)
}

async function decide(decision: Decision, authorizationId: string): Promise<{ error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const parsed = authorizationIdSchema.safeParse(authorizationId)
  if (!user) redirect(loginPath(parsed.success ? consentPath(parsed.data) : "/oauth/consent"))
  if (!parsed.success) return { error: "Demande d’autorisation invalide." }

  const request = await requestInfo()
  // Relue pour le journal : la ligne de décision porte le client tel que Supabase le décrit, pas tel que
  // le navigateur le renverrait. En échec, la décision passe quand même, la ligne sans client.
  const { data: current, error: readError } = await supabase.auth.oauth.getAuthorizationDetails(parsed.data)
  if (readError) console.error("[consent] relecture", readError)
  // Consentement donné entre l'affichage et le clic : Supabase rend déjà l'adresse de retour.
  if (current && !("authorization_id" in current)) {
    if (decision === "deny") return { error: ALREADY_GRANTED }
    await logConsent("auto", { user, request, redirectUrl: current.redirect_url })
    redirect(current.redirect_url)
  }

  const options = { skipBrowserRedirect: true }
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(parsed.data, options)
      : await supabase.auth.oauth.denyAuthorization(parsed.data, options)
  if (error || !data?.redirect_url) {
    console.error(`[consent] ${decision}`, error)
    return { error: FAILED[decision] }
  }

  await logConsent(decision === "approve" ? "approved" : "denied", { user, request, details: current, redirectUrl: data.redirect_url })
  redirect(data.redirect_url)
}
