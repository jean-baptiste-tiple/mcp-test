// @vitest-environment node
// Middleware des pages d'auth (E03-S03) : le matcher ne couvre que /login, /oauth/* et /auth-test/*, donc
// /api/*, /.well-known/*, / et /design-system restent hors session par construction (mcp-patterns §6 bis) ;
// une page protégée chargée sans session renvoie vers /login avec son chemin dans `redirect`, jamais un POST
// de Server Action ; une session rafraîchie (setAll) garde ses cookies et ses en-têtes ; une page servie ne
// peut pas être mise dans un cadre. Le matcher est évalué par Next lui-même (unstable_doesMiddlewareMatch),
// pas par une copie de sa conversion en regex.
import type { CookieMethodsServer } from "@supabase/ssr"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ssr = vi.hoisted(() => ({ getUser: vi.fn(), cookies: null as CookieMethodsServer | null }))
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieMethodsServer }) => {
    ssr.cookies = options.cookies
    return { auth: { getUser: ssr.getUser } }
  },
}))

import { config, middleware } from "@/middleware"

const ORIGIN = "https://mcp-test-acme.vercel.app"
const USER = { id: "user-1", email: "jb@example.test" }
/** Ce que @supabase/ssr passe à setAll quand il pose une session. */
const NO_CACHE = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" }

function matches(path: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` })
}

function signedIn(signed: boolean) {
  ssr.getUser.mockResolvedValue({ data: { user: signed ? USER : null }, error: null })
}

beforeEach(() => {
  ssr.getUser.mockReset()
  ssr.cookies = null
})

describe("config.matcher", () => {
  it.each([
    "/",
    "/api/mcp",
    "/api/proto/u/jb/mcp",
    "/api/auth-test/mcp",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/api/auth-test/mcp",
    "/design-system",
  ])("%s : hors du middleware", (path) => {
    expect(matches(path)).toBe(false)
  })

  it.each(["/login", "/oauth/consent", "/oauth/consent?authorization_id=abc", "/auth-test/grants"])(
    "%s : dans le middleware",
    (path) => {
      expect(matches(path)).toBe(true)
    }
  )
})

describe("middleware", () => {
  it("page protégée sans session : /login, chemin et query dans redirect", async () => {
    signedIn(false)

    const response = await middleware(new NextRequest(`${ORIGIN}/oauth/consent?authorization_id=abc`))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc`
    )
  })

  it("/auth-test/grants sans session : /login?redirect=/auth-test/grants", async () => {
    signedIn(false)

    const response = await middleware(new NextRequest(`${ORIGIN}/auth-test/grants`))

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("redirect")).toBe("/auth-test/grants")
  })

  it("POST de Server Action sans session : pas de redirection, l'action revérifie la session elle-même", async () => {
    signedIn(false)

    const response = await middleware(
      new NextRequest(`${ORIGIN}/oauth/consent?authorization_id=abc`, { method: "POST", headers: { "next-action": "7f3a9c" } })
    )

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })

  it("/login sans session : servi, pas de boucle", async () => {
    signedIn(false)

    const response = await middleware(new NextRequest(`${ORIGIN}/login`))

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("avec session : /login (changement de compte) et les pages protégées sont servis", async () => {
    signedIn(true)

    for (const path of ["/login", "/oauth/consent?authorization_id=abc", "/auth-test/grants"]) {
      const response = await middleware(new NextRequest(`${ORIGIN}${path}`))
      expect(response.headers.get("location")).toBeNull()
      expect(response.headers.get("x-middleware-next")).toBe("1")
      // Consentement jamais dans un cadre (clickjacking).
      expect(response.headers.get("x-frame-options")).toBe("DENY")
    }
  })

  it("session rafraîchie (setAll) : cookies posés, en-têtes anti-cache et X-Frame-Options sur la réponse recréée", async () => {
    ssr.getUser.mockImplementation(async () => {
      ssr.cookies?.setAll?.([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/", httpOnly: true } }], NO_CACHE)
      return { data: { user: USER }, error: null }
    })

    const response = await middleware(new NextRequest(`${ORIGIN}/oauth/consent?authorization_id=abc`))

    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed")
    expect(response.headers.get("cache-control")).toBe(NO_CACHE["Cache-Control"])
    expect(response.headers.get("expires")).toBe("0")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })
})
