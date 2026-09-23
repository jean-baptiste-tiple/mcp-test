// Jeton d'accès du serveur auth-test (ADR-004 §3, architecture §10.4) : signature par la JWKS du projet
// Supabase, `iss` et `exp` exigés ; `aud`, `client_id` et scopes relevés, jamais exigés. Sans ce module,
// withMcpAuth n'a aucun vérificateur : pas de 401 sur un jeton faux ou expiré, et le journal ne saurait pas
// pourquoi un jeton a été refusé (preuve 8 : « 401 expired » puis un nouvel `exp`, ou non).
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose"

import { summarizeClaims, type TokenSummary } from "./journal"

/**
 * Motif d'un 401, pour le journal seulement (le client lit « No authorization provided » dans tous les
 * cas) : absent, illisible, signé par une autre clé, expiré, autre émetteur, autre claim exigée
 * manquante (`exp`, `sub`), erreur inattendue (JWKS injoignable : console.error).
 */
export type RejectReason = "missing" | "malformed" | "signature" | "expired" | "issuer" | "claims" | "error"

/** Le motif seul : rien d'un jeton refusé ne va au journal (ni identité, ni résumé). */
export type Rejection = { reason: RejectReason }

/** Signature attendue par withMcpAuth (mcp-handler) ; undefined → 401. */
export type VerifyToken = (req: Request, bearer?: string) => Promise<AuthInfo | undefined>

/** Horloges de Supabase et de Vercel : quelques secondes d'écart ne doivent pas refuser un jeton. */
const CLOCK_TOLERANCE_S = 5

// Motif du dernier refus par requête : withMcpAuth ne transmet que undefined, la route le relit après.
const rejections = new WeakMap<Request, Rejection>()

export function rejectionOf(req: Request): Rejection | undefined {
  return rejections.get(req)
}

/** Résumé des claims que makeVerifyToken a rangé dans l'AuthInfo (`extra.claims`) ; undefined sans jeton vérifié. */
export function authClaims(auth: AuthInfo | undefined): TokenSummary | undefined {
  return auth ? summarizeClaims(auth.extra?.claims) : undefined
}

/** Émetteur des jetons du projet : `iss` exigé, `authorization_servers` des métadonnées. */
export function projectIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante (voir .env.example)")
  return `${url.replace(/\/+$/, "")}/auth/v1`
}

// Mémoïsée par process : jose y garde les clés en cache entre deux requêtes d'une même instance.
let remote: { issuer: string; jwks: JWTVerifyGetKey } | null = null

function remoteJwks(issuer: string): JWTVerifyGetKey {
  if (remote?.issuer !== issuer) remote = { issuer, jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) }
  return remote.jwks
}

/**
 * Vérificateur pour withMcpAuth. Par défaut, la JWKS distante du projet et son émetteur ; les tests
 * injectent une JWKS locale (`createLocalJWKSet`). Un refus rend undefined et note son motif
 * (`rejectionOf`).
 */
export function makeVerifyToken({ jwks, issuer = projectIssuer() }: { jwks?: JWTVerifyGetKey; issuer?: string } = {}): VerifyToken {
  const keys = jwks ?? remoteJwks(issuer)
  return async (req, bearer) => {
    const outcome = await verify(bearer, keys, issuer)
    if ("reason" in outcome) {
      rejections.set(req, outcome)
      return undefined
    }
    return outcome
  }
}

async function verify(bearer: string | undefined, keys: JWTVerifyGetKey, issuer: string): Promise<AuthInfo | Rejection> {
  if (!bearer) return { reason: "missing" }
  try {
    const { payload } = await jwtVerify(bearer, keys, { issuer, clockTolerance: CLOCK_TOLERANCE_S, requiredClaims: ["exp", "sub"] })
    const claims = summarizeClaims(payload)
    // Pas d'`expiresAt` : withMcpAuth revérifierait `exp` sans la tolérance, et rendrait un 401 sans
    // motif au journal. jose a déjà jugé `exp`, seul.
    return {
      token: bearer, // jamais journalisé : sert au client Supabase de l'utilisateur (RLS)
      clientId: claims.client_id ?? "",
      scopes: claims.scope ? claims.scope.split(" ").filter(Boolean) : [],
      extra: { claims },
    }
  } catch (error) {
    return rejectionFor(error)
  }
}

function rejectionFor(error: unknown): Rejection {
  if (error instanceof errors.JWTExpired) return { reason: "expired" }
  if (error instanceof errors.JWTClaimValidationFailed) return { reason: error.claim === "iss" ? "issuer" : "claims" }
  if (
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported
  ) {
    return { reason: "signature" }
  }
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) return { reason: "malformed" }
  console.error("[auth-test] vérification du jeton", error)
  return { reason: "error" }
}
