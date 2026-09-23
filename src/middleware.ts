// Session Supabase des pages d'auth (E03-S03, architecture §10.5), starter supabase-auth réduit. Sans lui,
// une session expirée n'est jamais rafraîchie (un Server Component ne peut pas écrire de cookie), et
// /oauth/consent ou /auth-test/grants sans session afficheraient une erreur au lieu de passer par /login
// puis de revenir à la page demandée.
//
// Tout /api/* reste public par construction (mcp-patterns §6 bis) : le matcher ne nomme que ces trois
// pages. /api/mcp (banc), /api/proto/* (proto), /api/auth-test/* (jeton vérifié par sa route),
// /.well-known/*, / et /design-system n'y passent jamais ; un nouveau route handler naît public et porte sa
// propre auth.
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { loginPath } from "@/lib/schemas/auth"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // En-têtes anti-cache fournis par @supabase/ssr : une réponse qui pose une session ne se met pas en cache.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // /login reste ouvert avec une session : on change de compte (JB, puis son alias) sans se déconnecter.
  // Chargements de page seulement (GET) : un POST de Server Action redirigé serait rejoué sur /login, qui
  // rend `{}`, d'où la page d'erreur générique ; la session reste rafraîchie et l'action revérifie getUser.
  if (!user && request.method === "GET" && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL(loginPath(request.nextUrl.pathname + request.nextUrl.search), request.url))
  }

  // Jamais dans un cadre : un site tiers ne peut pas faire cliquer « Autoriser » à l'insu de
  // l'utilisateur (clickjacking du consentement, RFC 6749 §10.13). Posé ici, après un éventuel setAll.
  response.headers.set("X-Frame-Options", "DENY")
  return response
}

export const config = {
  matcher: ["/login", "/oauth/:path*", "/auth-test/:path*"],
}
