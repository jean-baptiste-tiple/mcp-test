// Écrit les données de oauth-data.mjs dans le schéma `oauth_test` ; comptes et appartenances. Partagé
// par `pnpm oauth:seed`, `pnpm oauth:member` et les tests d'intégration (organisations jetables
// suffixées) : sans ce module, chacun réécrirait le seed et la recherche d'un compte par email, et les
// jeux de données divergeraient.
//
// `client` : client supabase-js à la clé secrète, schéma `oauth_test` (ADR-002 §3) ; `client.auth.admin`
// sert aux comptes.

import { OAUTH_ORGS } from "./oauth-data.mjs"

/** L'API d'administration n'a pas de recherche par email : listUsers page par page. */
const PER_PAGE = 1000

function check(result, what) {
  if (result.error) throw new Error(`[oauth-seed] ${what} : ${result.error.message}`)
  return result.data
}

/**
 * Suffixe : "" pour les données réelles ; "t3x9" pour des organisations de test : slug `acme-t3x9`,
 * préfixe `acmet3x9`, hôte `acme-t3x9.test`. Slugs, préfixes et hôtes sont uniques en base.
 */
function naming(suffix) {
  return {
    slug: (slug) => (suffix ? `${slug}-${suffix}` : slug),
    prefix: (prefix) => `${prefix}${suffix}`,
    host: (org) => (suffix ? `${org.slug}-${suffix}.test` : org.host),
  }
}

/** Compte Supabase Auth de cet email (casse ignorée), ou null. */
async function findUser(client, email) {
  const wanted = email.trim().toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`[oauth-seed] lecture des comptes : ${error.message}`)
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted)
    if (user) return user
    if (data.users.length < PER_PAGE) return null
  }
}

/**
 * Crée le compte s'il manque, email confirmé (aucun mail envoyé). Un compte existant n'est jamais
 * modifié, mot de passe compris : `created` dit lequel des deux mots de passe vaut.
 */
export async function ensureUser(client, email, password) {
  const existing = await findUser(client, email)
  if (existing) return { id: existing.id, created: false }
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`[oauth-seed] création du compte ${email} : ${error.message}`)
  return { id: data.user.id, created: true }
}

/** Ajoute ou retire une appartenance ; rend true si `members` a changé. Organisation ou compte inconnus : erreur nommée. */
export async function setMember(client, orgSlug, email, action) {
  if (action !== "add" && action !== "remove") throw new Error(`action inconnue : ${action} (add ou remove)`)
  const org = check(await client.from("orgs").select("id").eq("slug", orgSlug).maybeSingle(), `organisation ${orgSlug}`)
  if (!org) throw new Error(`organisation inconnue : ${orgSlug}`)
  const user = await findUser(client, email)
  if (!user) throw new Error(`compte inconnu : ${email}`)

  const rows =
    action === "add"
      ? check(
          await client
            .from("members")
            .upsert({ org_id: org.id, user_id: user.id, email: user.email }, { onConflict: "org_id,user_id", ignoreDuplicates: true })
            .select("user_id"),
          `ajout de ${email} à ${orgSlug}`
        )
      : check(
          await client.from("members").delete().eq("org_id", org.id).eq("user_id", user.id).select("user_id"),
          `retrait de ${email} de ${orgSlug}`
        )
  return rows.length > 0
}

/**
 * Écrit les deux organisations (mises à jour si elles existent : ids gardés, donc rejouable) et, sans
 * suffixe, leurs appartenances. Ne crée aucun compte : `pnpm oauth:seed` les demande à ensureUser avant.
 * Avec un suffixe, aucune appartenance : les tests y ajoutent leurs utilisateurs jetables par setMember.
 * Une appartenance ajoutée à la main n'est jamais retirée. Rend les organisations par slug de base.
 */
export async function seedOauthTest(client, { suffix = "" } = {}) {
  const name = naming(suffix)
  const rows = check(
    await client
      .from("orgs")
      .upsert(
        OAUTH_ORGS.map((org) => ({ slug: name.slug(org.slug), name: org.name, prefix: name.prefix(org.prefix), host: name.host(org) })),
        { onConflict: "slug" }
      )
      .select(),
    "organisations"
  )
  if (!suffix) {
    for (const org of OAUTH_ORGS) {
      for (const email of org.members) await setMember(client, org.slug, email, "add")
    }
  }
  return { orgs: Object.fromEntries(OAUTH_ORGS.map((org) => [org.slug, rows.find((row) => row.slug === name.slug(org.slug))])) }
}

/** Supprime des organisations ; la cascade emporte leurs appartenances (le journal, sans clé étrangère, reste). */
export async function deleteOauthTestOrgs(client, slugs) {
  check(await client.from("orgs").delete().in("slug", slugs), "suppression des organisations")
}
