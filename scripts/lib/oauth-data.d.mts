// Types d'accompagnement de oauth-data.mjs : sans eux, les tests (TypeScript strict) liraient les
// organisations du seed sans types. Déclaration seule, le module reste exécutable par `node`.
export declare const ACME_HOST: string
export declare const DELTA_HOST: string
export declare const JB_EMAIL: string
export declare const ALIAS_EMAIL: string

export interface OauthOrgData {
  slug: "acme" | "delta"
  name: string
  prefix: string
  host: string
  /** Emails des comptes membres. */
  members: string[]
}

export declare const OAUTH_ORGS: OauthOrgData[]
