// Connexion (E03-S03) : garde du retour après connexion (redirection ouverte), schéma du formulaire, et les
// actions login / logout avec le SDK Supabase simulé. La page /login rendue entière est un test
// d'intégration : tests/integration/login-page.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut } }),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

import { login, logout } from "@/lib/actions/auth"
import { DEFAULT_REDIRECT, loginSchema, safeRedirect } from "@/lib/schemas/auth"

const CONSENT = "/oauth/consent?authorization_id=a2b3c4d5e6f7g2h3i4j5k6l7m2n3o4p5"

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("safeRedirect", () => {
  it("garde un chemin relatif du site, query comprise", () => {
    expect(safeRedirect(CONSENT)).toBe(CONSENT)
    expect(safeRedirect("/auth-test/grants")).toBe("/auth-test/grants")
    expect(safeRedirect("/")).toBe("/")
  })

  it("refuse une autre origine, même déguisée", () => {
    for (const path of [
      "//evil.example",
      "//evil.example/oauth/consent",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "evil.example/path",
      "/\t/evil.example",
      "/\n/evil.example",
    ]) {
      expect(safeRedirect(path)).toBe(DEFAULT_REDIRECT)
    }
  })

  it("absent ou vide : les clients autorisés", () => {
    for (const path of ["", null, undefined]) {
      expect(safeRedirect(path)).toBe("/auth-test/grants")
    }
  })
})

describe("loginSchema", () => {
  it("email, mot de passe d'au moins 8 caractères, redirect optionnel", () => {
    expect(loginSchema.safeParse({ email: "jb@example.test", password: "12345678" }).success).toBe(true)
    expect(loginSchema.safeParse({ email: " jb@example.test ", password: "12345678", redirect: CONSENT }).data).toEqual({
      email: "jb@example.test",
      password: "12345678",
      redirect: CONSENT,
    })
  })

  it("refuse un email invalide, un mot de passe court, un champ manquant ; messages en français", () => {
    expect(loginSchema.safeParse({ email: "jb", password: "12345678" }).error?.issues[0]?.message).toBe("Email invalide")
    expect(loginSchema.safeParse({ email: "jb@example.test", password: "1234567" }).success).toBe(false)
    expect(loginSchema.safeParse({ email: "jb@example.test" }).error?.issues[0]?.message).toBe("Mot de passe requis")
    expect(loginSchema.safeParse({ password: "12345678" }).error?.issues[0]?.message).toBe("Email requis")
  })

  it("redirect trop long ou illisible : ignoré, jamais un refus", () => {
    for (const redirect of ["/" + "a".repeat(2048), 42]) {
      const parsed = loginSchema.safeParse({ email: "jb@example.test", password: "12345678", redirect })
      expect(parsed.success).toBe(true)
      expect(parsed.data?.redirect).toBeUndefined()
    }
  })
})

describe("login", () => {
  it("identifiants valides : session posée puis retour à la page demandée", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })

    await expect(login(form({ email: "jb@example.test", password: "12345678", redirect: CONSENT }))).rejects.toThrow(
      `NEXT_REDIRECT ${CONSENT}`
    )
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "jb@example.test", password: "12345678" })
    expect(mocks.redirect).toHaveBeenCalledWith(CONSENT)
  })

  it("redirect vers une autre origine : les clients autorisés", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })

    await expect(login(form({ email: "jb@example.test", password: "12345678", redirect: "//evil.example" }))).rejects.toThrow()
    expect(mocks.redirect).toHaveBeenCalledWith("/auth-test/grants")
  })

  it("redirect de plus de 2 048 caractères : connexion quand même, retour par défaut", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })

    await expect(login(form({ email: "jb@example.test", password: "12345678", redirect: "/" + "a".repeat(2048) }))).rejects.toThrow()
    expect(mocks.signInWithPassword).toHaveBeenCalledOnce()
    expect(mocks.redirect).toHaveBeenCalledWith(DEFAULT_REDIRECT)
  })

  it("identifiants faux : message générique, aucune redirection", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    })

    expect(await login(form({ email: "jb@example.test", password: "mauvais-mot" }))).toEqual({
      error: "Email ou mot de passe incorrect.",
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("saisie invalide : message du schéma, aucun appel à Supabase", async () => {
    expect(await login(form({ email: "pas-un-email", password: "12345678" }))).toEqual({ error: "Email invalide" })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

describe("logout", () => {
  it("ferme la session du navigateur seulement, puis /login", async () => {
    mocks.signOut.mockResolvedValue({ error: null })

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT /login")
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(console.error).not.toHaveBeenCalled()
  })

  it("échec de signOut : code en console (jamais le message), puis /login quand même", async () => {
    mocks.signOut.mockResolvedValue({ error: { code: "session_not_found", status: 404, message: "Session from session_id claim in JWT does not exist" } })

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT /login")
    expect(console.error).toHaveBeenCalledWith("[logout]", "session_not_found")
  })
})
