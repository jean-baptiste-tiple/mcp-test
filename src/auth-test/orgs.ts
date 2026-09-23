// Organisation = nom d'hôte appelé, jamais le jeton (ADR-004 §4) ; appartenance relue sous le jeton à
// chaque appel (§5). Sans ce module, la route MCP (S02) et la page de consentement (S03) recopieraient
// la normalisation de l'hôte et ses requêtes : deux normalisations qui divergent, et un même hôte
// servirait une organisation d'un côté et un 404 de l'autre.
import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { must, type OauthTestDb } from "./db"

/** Forme stockée dans `oauth_test.orgs.host` : minuscules, sans port, sans espaces ; "" si absent. */
export function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/:\d+$/, "")
}

/**
 * Hôte appelé, normalisé : `x-forwarded-host` (posé par Vercel ; premier élément d'une liste), sinon
 * `host`. Premier élément comme mcp-handler, qui en tire l'origine de `resource_metadata` dans le 401 :
 * l'organisation et l'adresse des métadonnées désignent le même hôte. Accepte aussi `headers()` de
 * next/headers.
 */
export function requestHost(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]
  return normalizeHost(forwarded || headers.get("host"))
}

/**
 * L'organisation servie par cet hôte, ou null, en une requête (aucune si l'hôte est vide). `db` est le
 * client à la clé secrète : l'hôte se résout avant tout jeton, et un non-membre doit voir son
 * organisation nommée dans le refus, ce que la RLS de `orgs` ne lui laisserait pas lire.
 */
export async function resolveOrg(db: OauthTestDb, host: string | null | undefined): Promise<OauthTestOrgRow | null> {
  const normalized = normalizeHost(host)
  if (!normalized) return null
  return must(await db.from("orgs").select("*").eq("host", normalized).maybeSingle(), "resolveOrg")
}

/**
 * Membre de l'organisation ? Par la seule RLS : `userDb` porte le jeton (userClient) et ne voit que ses
 * propres lignes de `members`, aucun `user_id` n'est passé. Relu à chaque appel, jamais mis en cache :
 * retirer un membre refuse l'appel suivant, même avec un jeton encore valide.
 */
export async function isMember(userDb: OauthTestDb, orgId: string): Promise<boolean> {
  const rows = must(await userDb.from("members").select("org_id").eq("org_id", orgId).limit(1), "isMember")
  return (rows ?? []).length > 0
}
