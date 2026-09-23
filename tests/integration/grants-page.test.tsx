// Page des clients autorisés (E03-S03) avec le SDK Supabase simulé : liste (nom, scopes, date), état vide,
// erreur de lecture, sans session, Révoquer (revokeGrant puis liste rafraîchie, ou message d'échec ;
// identifiant qui n'est pas un UUID) et Déconnexion en cours.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
  logout: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, oauth: { listGrants: mocks.listGrants, revokeGrant: mocks.revokeGrant } },
  }),
}))
vi.mock("@/lib/actions/auth", () => ({ logout: mocks.logout }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

import { revoke } from "@/app/(auth)/auth-test/grants/actions"
import GrantsPage from "@/app/(auth)/auth-test/grants/page"

const USER = { id: "5f0c1d7e-0000-4000-8000-000000000001", email: "jb@example.test" }
const CLAUDE = { id: "0b6c2a7e-1111-4000-8000-000000000002", name: "Claude Code", uri: "", logo_uri: "" }
const CHATGPT = { id: "0b6c2a7e-2222-4000-8000-000000000003", name: "ChatGPT", uri: "", logo_uri: "" }
const GRANTS = [
  { client: CLAUDE, scopes: ["openid", "email"], granted_at: "2026-09-23T12:05:00Z" },
  { client: CHATGPT, scopes: ["openid", "profile", "offline_access"], granted_at: "2026-09-23T15:30:00Z" },
]

// Sans `globals` dans vitest.config, Testing Library ne démonte rien entre deux tests.
afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.getUser.mockResolvedValue({ data: { user: USER }, error: null })
  mocks.listGrants.mockResolvedValue({ data: GRANTS, error: null })
})

describe("page /auth-test/grants", () => {
  it("liste : nom, scopes et date de chaque client, un Révoquer chacun, et Déconnexion", async () => {
    render(await GrantsPage())

    expect(screen.getByRole("heading", { level: 1, name: "Clients autorisés" })).toBeInTheDocument()
    expect(screen.getByText(`Assistants autorisés à agir au nom de ${USER.email}.`)).toBeInTheDocument()
    expect(screen.getByText("Claude Code")).toBeInTheDocument()
    expect(screen.getByText("ChatGPT")).toBeInTheDocument()
    expect(screen.getByText("offline_access")).toBeInTheDocument()
    expect(screen.getAllByText("openid")).toHaveLength(2)
    expect(document.querySelector('time[datetime="2026-09-23T12:05:00Z"]')).toHaveTextContent("23 septembre 2026")
    expect(screen.getByRole("button", { name: "Révoquer Claude Code" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Révoquer ChatGPT" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Déconnexion" })).toBeInTheDocument()
  })

  it("état vide : « Aucun client autorisé »", async () => {
    mocks.listGrants.mockResolvedValue({ data: [], error: null })

    render(await GrantsPage())

    expect(screen.getByRole("heading", { name: "Aucun client autorisé" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Révoquer/ })).toBeNull()
  })

  it("erreur de lecture : message, pas de liste", async () => {
    mocks.listGrants.mockResolvedValue({ data: null, error: { status: 500, message: "down" } })

    render(await GrantsPage())

    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de lire les clients autorisés.")
    expect(screen.queryByRole("button", { name: /^Révoquer/ })).toBeNull()
  })

  it("sans session : /login, retour à /auth-test/grants", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(GrantsPage()).rejects.toThrow("NEXT_REDIRECT /login?redirect=%2Fauth-test%2Fgrants")
    expect(mocks.listGrants).not.toHaveBeenCalled()
  })

  it("Révoquer : revokeGrant du client, puis liste rafraîchie", async () => {
    mocks.revokeGrant.mockResolvedValue({ data: {}, error: null })
    render(await GrantsPage())

    fireEvent.click(screen.getByRole("button", { name: "Révoquer ChatGPT" }))

    await waitFor(() => expect(mocks.revalidatePath).toHaveBeenCalledWith("/auth-test/grants"))
    expect(mocks.revokeGrant).toHaveBeenCalledWith({ clientId: CHATGPT.id })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("révocation en échec : message sous le bouton, liste inchangée", async () => {
    mocks.revokeGrant.mockResolvedValue({ data: null, error: { status: 500, message: "down" } })
    render(await GrantsPage())

    fireEvent.click(screen.getByRole("button", { name: "Révoquer Claude Code" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("La révocation n’a pas abouti.")
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("Déconnexion : bouton désactivé et signalé occupé pendant la déconnexion", async () => {
    mocks.logout.mockReturnValue(new Promise(() => {})) // déconnexion qui ne rend pas la main pendant le test
    render(await GrantsPage())

    fireEvent.click(screen.getByRole("button", { name: "Déconnexion" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Déconnexion" })).toBeDisabled())
    expect(screen.getByRole("button", { name: "Déconnexion" })).toHaveAttribute("aria-busy", "true")
    expect(mocks.logout).toHaveBeenCalledOnce()
  })
})

describe("action revoke", () => {
  it("réussite : l'identifiant révoqué", async () => {
    mocks.revokeGrant.mockResolvedValue({ data: {}, error: null })

    expect(await revoke(CLAUDE.id)).toEqual({ data: { clientId: CLAUDE.id } })
  })

  it("identifiant qui n'est pas un UUID : refus, aucun appel au serveur OAuth", async () => {
    expect(await revoke("pas-un-uuid")).toEqual({ error: "Client inconnu." })
    expect(mocks.revokeGrant).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
