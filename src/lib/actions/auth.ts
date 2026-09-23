"use server"

// Connexion et déconnexion des pages d'auth (E03-S03, FR-AUTH-08) : starter supabase-auth réduit à l'email
// et au mot de passe (pas d'inscription, de réinitialisation ni de lien magique : les comptes viennent du
// seed). Sans login, /oauth/consent n'a pas de session ; sans logout, pas de changement de compte (JB, puis
// son alias) pendant la campagne.
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { loginSchema, safeRedirect } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

// Un seul message pour tout refus : il ne dit pas si le compte existe.
const LOGIN_FAILED = "Email ou mot de passe incorrect."

export async function login(formData: FormData): Promise<{ error: string }> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? LOGIN_FAILED }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    console.error("[login]", error.code ?? error.status)
    return { error: LOGIN_FAILED }
  }

  revalidatePath("/", "layout")
  redirect(safeRedirect(parsed.data.redirect))
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  // Session de ce navigateur seulement : `global` (le défaut du SDK) fermerait aussi les sessions OAuth des
  // assistants connectés à ce compte, et chaque changement de compte déconnecterait les hosts.
  const { error } = await supabase.auth.signOut({ scope: "local" })
  if (error) console.error("[logout]", error.code ?? error.status)
  revalidatePath("/", "layout")
  redirect("/login")
}
