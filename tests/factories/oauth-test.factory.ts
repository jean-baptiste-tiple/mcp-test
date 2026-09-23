// Lignes `oauth_test.orgs` d'Acme et de Delta pour les tests sans base du serveur auth-test, tirées de
// OAUTH_ORGS (scripts/lib/oauth-data.mjs, source unique du seed), et l'émetteur des jetons de test. Sans
// elle, trois fichiers de test recopient ces lignes (et deux l'émetteur) : un nom, un préfixe ou un hôte
// changé dans le seed laisserait ces copies passer sur des organisations qui n'existent plus.
import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { OAUTH_ORGS, type OauthOrgData } from "../../scripts/lib/oauth-data.mjs"

/** Émetteur des jetons signés par une JWKS locale : un projet Supabase fictif, jamais celui du banc. */
export const TEST_ISSUER = "https://test-ref.supabase.co/auth/v1"

/** Colonnes que la base ajoute au seed : valeurs fixes, aucun test n'en dépend. */
const IDS: Record<OauthOrgData["slug"], string> = {
  acme: "00000000-0000-4000-8000-00000000000a",
  delta: "00000000-0000-4000-8000-00000000000d",
}
const CREATED_AT = "2026-09-23T00:00:00Z"

function orgRow(slug: OauthOrgData["slug"]): OauthTestOrgRow {
  const org = OAUTH_ORGS.find((candidate) => candidate.slug === slug)
  if (!org) throw new Error(`organisation absente de oauth-data.mjs : ${slug}`)
  return { id: IDS[slug], slug: org.slug, name: org.name, prefix: org.prefix, host: org.host, created_at: CREATED_AT }
}

export const ACME_ORG = orgRow("acme")
export const DELTA_ORG = orgRow("delta")

/** Par nom d'hôte, comme resolveOrg les trouve. */
export const ORGS_BY_HOST: Record<string, OauthTestOrgRow> = { [ACME_ORG.host]: ACME_ORG, [DELTA_ORG.host]: DELTA_ORG }
