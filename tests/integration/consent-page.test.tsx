// Page de consentement et ses décisions (E03-S03) avec le SDK Supabase simulé : sans session, sans
// authorization_id, détails affichés sous la marque de l'hôte, consentement déjà donné, erreur du SDK,
// clé secrète ou base des organisations en panne, Autoriser / Refuser ; et le journal de chaque affichage
// et décision, sans authorization_id ni code. Les tests d'approve / deny appelés sans interface restent ici,
// avec ceux de la page : ils partagent les mêmes simulations (SDK, journal, en-têtes).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
  getOauthTestClient: vi.fn(),
  flushJournal: vi.fn<(db: unknown, entries: Array<Record<string, unknown>>) => Promise<void>>(async () => {}),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  headers: vi.fn(),
  requestHeaders: {} as Record<string, string>,
  orgs: {} as Record<string, { name: string }>,
  orgsError: null as { code: string; message: string } | null,
}))

// La base à la clé secrète : resolveOrg lit orgs par hôte normalisé.
const oauthTestDb = {
  from: () => ({
    select: () => ({
      eq: (_column: string, host: string) => ({
        maybeSingle: async () => (mocks.orgsError ? { data: null, error: mocks.orgsError } : { data: mocks.orgs[host] ?? null, error: null }),
      }),
    }),
  }),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    mocks.createClient()
    return {
      auth: {
        getUser: mocks.getUser,
        oauth: {
          getAuthorizationDetails: mocks.getAuthorizationDetails,
          approveAuthorization: mocks.approveAuthorization,
          denyAuthorization: mocks.denyAuthorization,
        },
      },
    }
  },
}))
vi.mock("@/lib/supabase/admin", () => ({ getOauthTestClient: mocks.getOauthTestClient }))
vi.mock("@/auth-test/journal", () => ({ flushJournal: mocks.flushJournal }))
vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

import { approve, deny } from "@/app/(auth)/oauth/consent/actions"
import ConsentPage from "@/app/(auth)/oauth/consent/page"

const ID = "a2b3c4d5e6f7g2h3i4j5k6l7m2n3o4p5"
const USER = { id: "5f0c1d7e-0000-4000-8000-000000000001", email: "jb@example.test" }
const CLIENT = {
  id: "0b6c2a7e-1111-4000-8000-000000000002",
  name: "Claude Code",
  uri: "https://claude.ai",
  logo_uri: "https://claude.ai/logo.png",
}
const DETAILS = {
  authorization_id: ID,
  redirect_uri: "http://localhost:53682/callback",
  client: CLIENT,
  user: USER,
  scope: "openid email profile",
}
const CODE = "c0de-never-journaled"
const RETURN = `http://localhost:53682/callback?code=${CODE}&state=xyz`

function renderPage(params: Record<string, string>) {
  return ConsentPage({ searchParams: Promise.resolve(params) })
}

function journaled(): Array<Record<string, unknown>> {
  return mocks.flushJournal.mock.calls.flatMap(([, entries]) => entries)
}

// Sans `globals` dans vitest.config, Testing Library ne démonte rien entre deux tests.
afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.requestHeaders = { "x-forwarded-host": "mcp-test-acme.vercel.app", host: "internal:3000", "user-agent": "Claude-Test/1.0" }
  mocks.headers.mockImplementation(async () => new Headers(mocks.requestHeaders))
  mocks.orgs = { "mcp-test-acme.vercel.app": { name: "Acme" } }
  mocks.orgsError = null
  mocks.getOauthTestClient.mockReturnValue(oauthTestDb)
  mocks.getUser.mockResolvedValue({ data: { user: USER }, error: null })
  mocks.getAuthorizationDetails.mockResolvedValue({ data: DETAILS, error: null })
})

describe("page /oauth/consent", () => {
  it("sans session : /login, retour à la demande encodé dans redirect", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(renderPage({ authorization_id: ID })).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.redirect).toHaveBeenCalledWith(`/login?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3D${ID}`)
    expect(mocks.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it("sans authorization_id ou avec un identifiant malformé : message, aucun appel au SDK", async () => {
    const cases: Array<Record<string, string>> = [{}, { authorization_id: "../../admin/users" }]
    for (const params of cases) {
      const { unmount } = render(await renderPage(params))
      expect(screen.getByRole("heading", { name: "Demande d’autorisation introuvable" })).toBeInTheDocument()
      unmount()
    }
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(mocks.flushJournal).not.toHaveBeenCalled()
  })

  it("détails : marque de l'hôte, client, adresse de retour, scopes un par un, compte, Autoriser et Refuser", async () => {
    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByText("Acme")).toBeInTheDocument()
    // Le logo ne répète pas la marque aux lecteurs d'écran : elle est écrite à côté.
    expect(screen.queryByRole("img", { name: "Acme" })).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Claude Code demande l’accès à votre compte")
    expect(screen.getByRole("link", { name: "https://claude.ai/" })).toHaveAttribute("href", "https://claude.ai/")
    expect(document.querySelector("img")).toHaveAttribute("src", CLIENT.logo_uri)
    expect(screen.getByText(DETAILS.redirect_uri)).toBeInTheDocument()
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["openid", "email", "profile"])
    expect(screen.getByText(USER.email)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Refuser" })).toBeEnabled()
    expect(mocks.getAuthorizationDetails).toHaveBeenCalledWith(ID)
    // Hôte et navigateur lus une seule fois pour le journal et la marque.
    expect(mocks.headers).toHaveBeenCalledOnce()
  })

  it("scope demandé deux fois : affiché deux fois, tel que le host l'envoie", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({ data: { ...DETAILS, scope: "openid openid email" }, error: null })

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["openid", "openid", "email"])
  })

  it("affichage journalisé (shown) : client, adresse de retour, scopes, hôte, compte, navigateur", async () => {
    await renderPage({ authorization_id: ID })

    expect(mocks.flushJournal).toHaveBeenCalledWith(oauthTestDb, [expect.any(Object)])
    expect(journaled()).toEqual([
      {
        decision: "consent",
        host: "mcp-test-acme.vercel.app",
        user_id: USER.id,
        email: USER.email,
        user_agent: "Claude-Test/1.0",
        client_id: CLIENT.id,
        client_name: CLIENT.name,
        consent: { stage: "shown", client: CLIENT, redirect_uri: DETAILS.redirect_uri, scope: DETAILS.scope },
      },
    ])
    expect(JSON.stringify(journaled())).not.toContain(ID)
  })

  it("x-forwarded-host en liste : premier élément, comme la route MCP (marque « Acme »)", async () => {
    mocks.requestHeaders = { "x-forwarded-host": "mcp-test-acme.vercel.app, proxy", host: "internal:3000" }

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByText("Acme")).toBeInTheDocument()
    expect(journaled()[0]).toMatchObject({ host: "mcp-test-acme.vercel.app" })
  })

  it("hôte sans organisation : marque « Banc MCP »", async () => {
    mocks.requestHeaders = { host: "localhost:3000" }

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByText("Banc MCP")).toBeInTheDocument()
    expect(journaled()[0]).toMatchObject({ host: "localhost" })
  })

  it("base des organisations en panne : page rendue sous « Banc MCP », affichage journalisé quand même", async () => {
    mocks.orgsError = { code: "XX000", message: "down" }

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByText("Banc MCP")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
    expect(journaled()).toEqual([expect.objectContaining({ consent: expect.objectContaining({ stage: "shown" }) })])
  })

  it("clé secrète absente (getOauthTestClient lève) : page rendue sous « Banc MCP », journal perdu en console seulement", async () => {
    mocks.getOauthTestClient.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante (voir .env.example)")
    })

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByText("Banc MCP")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
    expect(mocks.flushJournal).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith("[consent] journal", expect.any(Error))
  })

  it("site et logo hors http(s) : ni lien ni image", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({
      data: { ...DETAILS, client: { ...CLIENT, uri: "javascript:alert(1)", logo_uri: "data:image/png;base64,AAAA" } },
      error: null,
    })

    render(await renderPage({ authorization_id: ID }))

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector("img")).toBeNull()
  })

  it("consentement déjà donné : journal auto sans code, puis redirection vers l'assistant", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    await expect(renderPage({ authorization_id: ID })).rejects.toThrow(`NEXT_REDIRECT ${RETURN}`)
    expect(journaled()).toEqual([
      expect.objectContaining({
        decision: "consent",
        client_id: null,
        consent: { stage: "auto", client: null, redirect_uri: "http://localhost:53682/callback", scope: null },
      }),
    ])
    expect(JSON.stringify(journaled())).not.toContain(CODE)
  })

  it("erreur du SDK : message, aucune redirection ni journal", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { status: 404, code: "oauth_authorization_not_found", message: "authorization not found" },
    })

    render(await renderPage({ authorization_id: ID }))

    expect(screen.getByRole("heading", { name: "Demande d’autorisation invalide ou expirée" })).toBeInTheDocument()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.flushJournal).not.toHaveBeenCalled()
  })
})

describe("décisions approve / deny", () => {
  it("Autoriser : approveAuthorization sans redirection du SDK, journal approved, retour à l'assistant", async () => {
    mocks.approveAuthorization.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    await expect(approve(ID)).rejects.toThrow(`NEXT_REDIRECT ${RETURN}`)
    expect(mocks.approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true })
    expect(mocks.denyAuthorization).not.toHaveBeenCalled()
    expect(journaled()).toEqual([
      expect.objectContaining({
        host: "mcp-test-acme.vercel.app",
        consent: { stage: "approved", client: CLIENT, redirect_uri: DETAILS.redirect_uri, scope: DETAILS.scope },
      }),
    ])
    expect(JSON.stringify(journaled())).not.toContain(CODE)
    expect(JSON.stringify(journaled())).not.toContain(ID)
  })

  it("Refuser : denyAuthorization, journal denied, retour à l'assistant", async () => {
    const denied = "http://localhost:53682/callback?error=access_denied&state=xyz"
    mocks.denyAuthorization.mockResolvedValue({ data: { redirect_url: denied }, error: null })

    await expect(deny(ID)).rejects.toThrow(`NEXT_REDIRECT ${denied}`)
    expect(mocks.denyAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true })
    expect(mocks.approveAuthorization).not.toHaveBeenCalled()
    expect(journaled()).toEqual([expect.objectContaining({ consent: expect.objectContaining({ stage: "denied" }) })])
  })

  it("Autoriser après un consentement donné ailleurs (relecture → redirect_url) : journal auto, retour à l'assistant", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    await expect(approve(ID)).rejects.toThrow(`NEXT_REDIRECT ${RETURN}`)
    expect(mocks.approveAuthorization).not.toHaveBeenCalled()
    expect(journaled()).toEqual([expect.objectContaining({ consent: expect.objectContaining({ stage: "auto", client: null }) })])
    expect(JSON.stringify(journaled())).not.toContain(CODE)
  })

  it("Refuser après un consentement donné ailleurs : message, aucune décision, redirection ni journal", async () => {
    mocks.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    expect(await deny(ID)).toEqual({
      error: "Cet assistant est déjà autorisé : la demande ne peut plus être refusée. Retirez-lui l’accès depuis la page des clients autorisés.",
    })
    expect(mocks.denyAuthorization).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.flushJournal).not.toHaveBeenCalled()
  })

  it("relecture en échec : la décision passe quand même, ligne sans client, panne en console", async () => {
    const readError = { status: 500, message: "down" }
    mocks.getAuthorizationDetails.mockResolvedValue({ data: null, error: readError })
    mocks.approveAuthorization.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    await expect(approve(ID)).rejects.toThrow(`NEXT_REDIRECT ${RETURN}`)
    expect(mocks.approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true })
    expect(journaled()).toEqual([
      expect.objectContaining({
        client_id: null,
        consent: { stage: "approved", client: null, redirect_uri: "http://localhost:53682/callback", scope: null },
      }),
    ])
    expect(console.error).toHaveBeenCalledWith("[consent] relecture", readError)
  })

  it("clé secrète absente (getOauthTestClient lève) : la décision passe, journal perdu en console seulement", async () => {
    mocks.getOauthTestClient.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante (voir .env.example)")
    })
    mocks.approveAuthorization.mockResolvedValue({ data: { redirect_url: RETURN }, error: null })

    await expect(approve(ID)).rejects.toThrow(`NEXT_REDIRECT ${RETURN}`)
    expect(mocks.flushJournal).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith("[consent] journal", expect.any(Error))
  })

  it("erreur du SDK : message, aucune redirection ni journal", async () => {
    mocks.approveAuthorization.mockResolvedValue({ data: null, error: { status: 400, message: "no longer pending" } })

    expect(await approve(ID)).toEqual({ error: "L’autorisation n’a pas abouti. Rechargez la page, puis réessayez." })
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.flushJournal).not.toHaveBeenCalled()
  })

  it("session expirée : /login puis retour à la demande, aucune décision", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(approve(ID)).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.redirect).toHaveBeenCalledWith(`/login?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3D${ID}`)
    expect(mocks.approveAuthorization).not.toHaveBeenCalled()
  })

  it("identifiant malformé : refus, aucun appel au serveur OAuth", async () => {
    expect(await deny("../../user")).toEqual({ error: "Demande d’autorisation invalide." })
    expect(mocks.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(mocks.denyAuthorization).not.toHaveBeenCalled()
  })

  it("l'erreur d'une décision s'affiche sous les boutons", async () => {
    mocks.approveAuthorization.mockResolvedValue({ data: null, error: { status: 400, message: "no longer pending" } })
    render(await renderPage({ authorization_id: ID }))

    fireEvent.click(screen.getByRole("button", { name: "Autoriser" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("L’autorisation n’a pas abouti.")
    await waitFor(() => expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled())
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
