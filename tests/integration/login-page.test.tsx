// Page /login rendue entière (E03-S03), SDK Supabase simulé : formulaire réduit (ni inscription ni mot de
// passe oublié, autoComplete, retour demandé en champ caché) et erreur d'identifiants affichée sous le
// formulaire, sans redirection. Sans ce fichier, rien ne vérifie la page que JB et les hosts traversent
// avant chaque consentement.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

import LoginPage from "@/app/(auth)/login/page"

const CONSENT = "/oauth/consent?authorization_id=a2b3c4d5e6f7g2h3i4j5k6l7m2n3o4p5"

// Sans `globals` dans vitest.config, Testing Library ne démonte rien entre deux tests.
afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("page /login", () => {
  it("email et mot de passe avec autoComplete, retour demandé en champ caché, aucun lien", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirect: CONSENT }) }))

    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("autocomplete", "current-password")
    expect(document.querySelector('input[type="hidden"][name="redirect"]')).toHaveAttribute("value", CONSENT)
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled()
    expect(screen.queryAllByRole("link")).toEqual([])
  })

  it("identifiants refusés : erreur sous le formulaire, bouton réactivé, aucune redirection", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    })
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jb@example.test" } })
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "mauvais-mot" } })
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Email ou mot de passe incorrect.")
    await waitFor(() => expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled())
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "jb@example.test", password: "mauvais-mot" })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
