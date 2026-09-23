"use server"

// Révocation d'un client autorisé depuis /auth-test/grants (E03-S03, preuve 8) : revokeGrant marque le
// consentement révoqué et ferme les sessions de ce client. Sans elle, la page liste les clients sans pouvoir
// en retirer un, et la preuve de révocation dépend du tableau de bord Supabase. La déconnexion est `logout`
// de lib/actions/auth.ts, pas une copie ici.
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { clientIdSchema, GRANTS_PATH, loginPath } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

type RevokeResult = { data: { clientId: string }; error?: never } | { error: string; data?: never }

export async function revoke(clientId: string): Promise<RevokeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(loginPath(GRANTS_PATH))

  const parsed = clientIdSchema.safeParse(clientId)
  if (!parsed.success) return { error: "Client inconnu." }

  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: parsed.data })
  if (error) {
    console.error("[grants] revokeGrant", error)
    return { error: "La révocation n’a pas abouti. Réessayez." }
  }

  revalidatePath(GRANTS_PATH)
  return { data: { clientId: parsed.data } }
}
