// Paramètres des pages d'auth du serveur auth-test (E03-S03, architecture §10.5) : entrée du formulaire de
// connexion, identifiants de /oauth/consent et de /auth-test/grants, retour après connexion, libellés
// communs aux pages. Sans ce module, la page et l'action de chaque formulaire valideraient chacune de leur
// côté (CLAUDE.md : Zod partagé), et le `redirect` du login renverrait n'importe où (redirection ouverte).
// La garde n'est pas dans lib/actions/auth.ts : un fichier "use server" n'exporte que des fonctions async,
// sinon le build échoue.
import { z } from "zod"

/** Clients autorisés du compte : page de révocation, et retour par défaut après connexion. */
export const GRANTS_PATH = "/auth-test/grants"

/** Destination après connexion quand `redirect` est absent ou refusé : les clients autorisés du compte. */
export const DEFAULT_REDIRECT = GRANTS_PATH

/** Marque du site : page de connexion, et page de consentement d'un hôte sans organisation. */
export const SITE_BRAND = "Banc MCP"

/** Nom affiché d'un client OAuth enregistré sans nom (Supabase omet alors `name`). */
export const UNNAMED_CLIENT = "Client sans nom"

export const loginSchema = z.object({
  email: z.string({ required_error: "Email requis" }).trim().email("Email invalide").max(255),
  password: z
    .string({ required_error: "Mot de passe requis" })
    .min(8, "Le mot de passe compte au moins 8 caractères")
    .max(255),
  /**
   * Page d'où vient l'utilisateur ; relue par safeRedirect avant toute redirection. Illisible ou trop
   * longue : ignorée (retour par défaut), jamais un refus de connexion.
   */
  redirect: z.string().max(2048).optional().catch(undefined),
})

/**
 * `authorization_id` de Supabase (32 caractères base32 en 2026-09) : le SDK le place tel quel dans le
 * chemin de ses appels (`/oauth/authorizations/<id>`). Un `/`, un `.` ou un `?` y viserait un autre point
 * de l'API d'auth avec la session de l'utilisateur.
 */
export const authorizationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/)

/** Identifiant d'un client du serveur OAuth : un UUID (auth-js, OAuthAuthorizationClient.id). */
export const clientIdSchema = z.string().uuid()

/**
 * Chemin du site, ou DEFAULT_REDIRECT. Refuse ce qui ne commence pas par `/`, `//hôte` et `/\hôte` (le
 * navigateur les lit comme une autre origine) et tout blanc : il retire tabulations et sauts de ligne d'une
 * URL, `/<tab>/hôte` deviendrait `//hôte`.
 */
export function safeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return DEFAULT_REDIRECT
  return path
}

/** Page de connexion qui ramène à `path` une fois la session posée. */
export function loginPath(path: string): string {
  return `/login?redirect=${encodeURIComponent(path)}`
}

/** Page de consentement d'une demande d'autorisation. */
export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
}
