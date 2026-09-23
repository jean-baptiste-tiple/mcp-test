// Types d'accompagnement de oauth-seed.mjs : sans eux, les tests d'intégration (TypeScript strict)
// importeraient seedOauthTest et setMember en `any`. Déclaration seule, le module reste exécutable par `node`.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { OauthTestDatabase, OauthTestOrgRow } from "../../src/types/oauth-test-database"

export type OauthTestClient = SupabaseClient<OauthTestDatabase, "oauth_test">

export interface OauthSeedResult {
  /** Par slug de base. */
  orgs: Record<"acme" | "delta", OauthTestOrgRow>
}

export declare function seedOauthTest(client: OauthTestClient, options?: { suffix?: string }): Promise<OauthSeedResult>
export declare function ensureUser(client: OauthTestClient, email: string, password: string): Promise<{ id: string; created: boolean }>
export declare function setMember(client: OauthTestClient, orgSlug: string, email: string, action: "add" | "remove"): Promise<boolean>
export declare function deleteOauthTestOrgs(client: OauthTestClient, slugs: string[]): Promise<void>
