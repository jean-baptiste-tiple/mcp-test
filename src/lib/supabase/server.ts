// Client Supabase au nom de l'utilisateur connecté, session lue dans les cookies de la requête (starter
// supabase-auth, E03-S03). Sans lui, ni la connexion ni le serveur OAuth de Supabase
// (getAuthorizationDetails, approveAuthorization, listGrants, revokeGrant) n'ont de session : ces appels
// exigent le jeton de l'utilisateur, que seule la session posée par /login fournit. Clé publique : RLS.
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Appelé depuis un Server Component, qui ne peut pas écrire de cookie : le middleware
            // rafraîchit la session de ces pages (src/middleware.ts).
          }
        },
      },
    }
  )
}
