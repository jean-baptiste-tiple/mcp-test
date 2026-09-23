// Couche HTTP du serveur auth-test (architecture §10.4) : /api/auth-test/mcp (hôte → organisation, 401 de
// withMcpAuth, handler MCP par requête) et /.well-known/oauth-protected-resource (RFC 9728 par hôte), avec
// une ligne de journal par message reçu. Les deux route.ts n'y branchent que les dépendances réelles
// (client à clé secrète, JWKS du projet, after). Sans ce module, cette logique vivrait dans les route.ts,
// que les tests n'appellent pas sans simuler next/server (after hors requête jette), le client à clé
// secrète (`server-only`) et la JWKS distante : les preuves sans host (401 par hôte, 404, métadonnées,
// journal) demanderaient le réseau.
import { createMcpHandler, generateProtectedResourceMetadata, withMcpAuth } from "mcp-handler"

import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { STORE_UNAVAILABLE } from "./db"
import { claimColumns, rpcCalls, type JournalEntry, type RequestFacts, type RpcCall } from "./journal"
import { buildServerOptions, installAuthTest } from "./mcp/server"
import { requestHost } from "./orgs"
import { authClaims, rejectionOf, type Rejection, type VerifyToken } from "./token"

/** Chemin de la ressource protégée, le même sur chaque hôte (basePath de mcp-handler + `/mcp`). */
const RESOURCE_PATH = "/api/auth-test/mcp"
const METADATA_ROOT = "/.well-known/oauth-protected-resource"
/** Variante suffixée (RFC 9728 §3.1) : celle que désigne `resource_metadata` dans le 401. */
const METADATA_PATH = `${METADATA_ROOT}${RESOURCE_PATH}`
/**
 * Formes d'URL servies. La troisième (ressource puis `/.well-known/…`), que certains hosts tentent, arrive
 * par la réécriture de next.config.ts ; Next transmet au handler l'URL d'origine d'une réécriture : sans
 * elle ici, la réécriture rendrait 404 `unknown_path`. Le journal garde ainsi la forme lue par le host.
 */
const METADATA_PATHS = new Set([METADATA_ROOT, METADATA_PATH, `${RESOURCE_PATH}${METADATA_ROOT}`])
/** Scopes du serveur OAuth Supabase ; aucun n'autorise quoi que ce soit ici (ADR-004 §3). */
const SCOPES_SUPPORTED = ["openid", "email", "profile", "offline_access"]
const CORS = { "Access-Control-Allow-Origin": "*" }
/** Méthodes que l'adaptateur journalise lui-même, avec la décision d'appartenance (server.ts). */
const LOGGED_BY_SERVER = new Set(["tools/list", "tools/call"])
/**
 * Décision d'une requête au jeton valide que le transport refuse (corps illisible, 406, 415, version de
 * protocole) : rien n'a été servi, donc jamais `allowed`, et le check de la migration n'a pas de valeur
 * « refusée par le transport ». Refus sous denied_not_member, motif explicite (`parse_error`,
 * `http_<statut>`), comme membership_unavailable (server.ts).
 */
const TRANSPORT_REFUSED: JournalEntry["decision"] = "denied_not_member"

export type HostDeps = {
  /** Organisation servie par ce nom d'hôte ; la route interroge avec la clé secrète (avant tout jeton). */
  resolveOrg: (host: string) => Promise<OauthTestOrgRow | null>
  /**
   * Reçoit les lignes de la requête. Le tableau se remplit encore pendant le flux de la réponse (les
   * outils s'exécutent alors) : la route l'écrit dans after(), jamais sur-le-champ.
   */
  journal: (entries: JournalEntry[]) => void
}

export type McpDeps = HostDeps & { verifyToken: VerifyToken }

/** `issuer` : émetteur des jetons du projet, seul `authorization_servers` (ADR-004 §1). */
export type MetadataDeps = HostDeps & { issuer: string }

function requestFacts(request: Request): RequestFacts {
  return {
    host: requestHost(request.headers),
    path: new URL(request.url).pathname,
    user_agent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip"),
  }
}

function rpcError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status })
}

/**
 * Lignes d'une requête refusée avant tout handler (404, 401) : une par message JSON-RPC du corps (sa
 * méthode), sinon une à la méthode HTTP. Rien d'autre que la requête et le refus : aucun jeton refusé
 * ne renseigne l'identité.
 */
function refusalLines(request: Request, facts: RequestFacts, calls: RpcCall[], refusal: Pick<JournalEntry, "decision" | "reason">): JournalEntry[] {
  const methods = calls.length > 0 ? calls.map((call) => call.method) : [request.method]
  return methods.map((method) => ({ ...facts, method, ...refusal }))
}

/** Organisation de l'hôte appelé, ou la réponse à rendre : 404 JSON-RPC journalisé, 503 si la base ne répond pas. */
async function orgOrRefusal(request: Request, facts: RequestFacts, calls: RpcCall[], deps: HostDeps): Promise<OauthTestOrgRow | Response> {
  let org: OauthTestOrgRow | null
  try {
    org = await deps.resolveOrg(facts.host)
  } catch {
    // resolveOrg (must) a journalisé la panne en console ; le journal en base est aussi injoignable.
    return rpcError(503, -32603, STORE_UNAVAILABLE)
  }
  if (org) return org
  deps.journal(refusalLines(request, facts, calls, { decision: "unknown_host" }))
  return rpcError(404, -32001, "Unknown host")
}

/**
 * POST /api/auth-test/mcp : hôte → organisation (404), jeton (401 et `WWW-Authenticate` de l'hôte appelé,
 * motif au journal seulement), puis un handler MCP construit pour cette requête (stateless, ADR-001).
 */
export async function handleMcpPost(request: Request, deps: McpDeps): Promise<Response> {
  const facts = requestFacts(request)
  const calls = rpcCalls(await request.clone().text())
  const org = await orgOrRefusal(request, facts, calls ?? [], deps)
  if (org instanceof Response) return org

  const entries: JournalEntry[] = []
  const mcp = createMcpHandler((server) => installAuthTest(server, { org, request: facts, journal: entries }), buildServerOptions(org), {
    basePath: "/api/auth-test", // → /api/auth-test/mcp
    maxDuration: 60,
    disableSse: true,
  })

  const authenticated = withMcpAuth(
    async (req) => {
      const admitted = { ...facts, org_slug: org.slug, ...claimColumns(authClaims(req.auth)) }
      if (calls === null) {
        // mcp-handler lit le corps sans attendre son échec : il ne répondrait jamais (requête pendue jusqu'à
        // maxDuration, aucune ligne). Refus ici, sans l'appeler.
        entries.push({ ...admitted, method: request.method, decision: TRANSPORT_REFUSED, reason: "parse_error" })
        return rpcError(400, -32700, "Parse error")
      }
      // initialize (et son client), notifications, ping : aucun handler à nous ne les voit passer.
      for (const call of calls.filter((c) => !LOGGED_BY_SERVER.has(c.method))) {
        entries.push({ ...admitted, ...call, decision: "allowed" })
      }
      const response = await mcp(req)
      if (response.status >= 400) {
        // Refus du transport (406 sans text/event-stream, 415, version de protocole) avant tout message :
        // rien de servi, server.ts n'a rien vu. Les lignes allowed ci-dessus deviennent une ligne refusée
        // par message du corps (une à la méthode HTTP s'il n'en porte aucun).
        const refused = calls.length > 0 ? calls : [{ method: request.method, client_name: null }]
        const reason = `http_${response.status}`
        entries.splice(0, entries.length, ...refused.map((call) => ({ ...admitted, ...call, decision: TRANSPORT_REFUSED, reason })))
      }
      return response
    },
    deps.verifyToken,
    // Sans resourceUrl : l'origine vient de x-forwarded-host / x-forwarded-proto, donc de l'hôte appelé.
    { required: true, resourceMetadataPath: METADATA_PATH }
  )

  const response = await authenticated(request)
  if (response.status === 401) {
    // Aucun motif noté : le vérificateur a jeté, withMcpAuth a répondu « Invalid token ».
    const { reason }: Rejection = rejectionOf(request) ?? { reason: "error" }
    const decision = reason === "missing" ? "unauthenticated" : "invalid_token"
    entries.push(...refusalLines(request, facts, calls ?? [], { decision, reason }))
  }
  deps.journal(entries)
  return response
}

/** GET et DELETE /api/auth-test/mcp : pas de flux SSE ni de session (ADR-001) ; hôte inconnu : 404 d'abord. */
export async function handleMcpRefused(request: Request, deps: HostDeps): Promise<Response> {
  const org = await orgOrRefusal(request, requestFacts(request), [], deps)
  if (org instanceof Response) return org
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

/**
 * GET /.well-known/oauth-protected-resource[/api/auth-test/mcp] (et la variante réécrite) : métadonnées de
 * l'hôte appelé, les mêmes sous chaque forme d'URL ; hôte inconnu ou autre ressource : 404. Chaque
 * lecture au journal.
 */
export async function handleMetadata(request: Request, deps: MetadataDeps): Promise<Response> {
  const facts = requestFacts(request)
  const entry: JournalEntry = { ...facts, method: request.method, decision: "metadata" }
  try {
    const org = await deps.resolveOrg(facts.host)
    if (!org) {
      entry.reason = "unknown_host"
      return Response.json({ error: "Unknown host" }, { status: 404, headers: CORS })
    }
    entry.org_slug = org.slug
    if (!METADATA_PATHS.has(facts.path)) {
      entry.reason = "unknown_path"
      return Response.json({ error: "Unknown resource" }, { status: 404, headers: CORS })
    }
    const metadata = generateProtectedResourceMetadata({
      authServerUrls: [deps.issuer],
      resourceUrl: `https://${org.host}${RESOURCE_PATH}`,
      additionalMetadata: {
        scopes_supported: SCOPES_SUPPORTED,
        bearer_methods_supported: ["header"],
        resource_documentation: `https://${org.host}/auth-test/grants`,
      },
    })
    return Response.json(metadata, { headers: CORS })
  } catch {
    // resolveOrg (must) a journalisé la panne en console.
    entry.reason = "store_unavailable"
    return Response.json({ error: STORE_UNAVAILABLE }, { status: 503, headers: CORS })
  } finally {
    deps.journal([entry])
  }
}
