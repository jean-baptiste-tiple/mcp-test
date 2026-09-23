// Types d'accompagnement de oauth-admin.mjs : sans eux, le test d'intégration (TypeScript strict)
// importerait les appels en `any`. Déclaration seule, le module reste exécutable par `node`.
import type { OauthTestDatabase } from "../../src/types/oauth-test-database"

import type { OauthTestClient } from "./oauth-seed.mjs"

export type AuthColumn = OauthTestDatabase["oauth_test"]["Functions"]["auth_columns"]["Returns"][number]
/** Ligne d'une table `auth` telle que la base la rend en jsonb, sans les clés des secrets, des codes et des jetons. */
export type AuthRow = Record<string, unknown>
/** Ligne de `auth.sessions`, plus le nom de son client OAuth, ses refresh tokens (`auth.refresh_tokens` de la session) et les révoqués. */
export type SessionRow = AuthRow & { client_name: string | null; refresh_tokens_total: number; refresh_tokens_revoked: number }
/** Ligne de `auth.oauth_authorizations` ou `auth.oauth_consents`, plus le nom du client et l'email du compte (null sans correspondance). */
export type OauthRow = AuthRow & { client_name: string | null; email: string | null }

export declare function authColumns(client: OauthTestClient): Promise<AuthColumn[]>
export declare function registeredClients(client: OauthTestClient): Promise<AuthRow[]>
/** Compte inconnu : lève « compte inconnu : <email> ». */
export declare function userSessions(client: OauthTestClient, email: string): Promise<SessionRow[]>
/** Nombre de sessions supprimées ; compte inconnu : lève « compte inconnu : <email> ». */
export declare function revokeUserSessions(client: OauthTestClient, email: string): Promise<number>
/**
 * Nombre de consentements, d'autorisations et de sessions du compte supprimés pour les clients de ce nom ;
 * compte inconnu : lève « compte inconnu : <email> ».
 */
export declare function revokeClientGrants(client: OauthTestClient, email: string, clientName: string): Promise<number>
/** Toutes les autorisations, ou celles du compte ; compte inconnu : lève « compte inconnu : <email> ». */
export declare function oauthAuthorizations(client: OauthTestClient, email?: string): Promise<OauthRow[]>
/** Tous les consentements, ou ceux du compte ; compte inconnu : lève « compte inconnu : <email> ». */
export declare function oauthConsents(client: OauthTestClient, email?: string): Promise<OauthRow[]>
export declare function formatColumns(rows: AuthColumn[]): string
export declare function formatClients(rows: AuthRow[]): string
export declare function formatSessions(rows: SessionRow[]): string
export declare function formatAuthorizations(rows: OauthRow[]): string
export declare function formatConsents(rows: OauthRow[]): string
