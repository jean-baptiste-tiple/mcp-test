// Écrit les données de proto-data.mjs dans le schéma `proto`. Partagé par `pnpm proto:seed` (orgs
// réelles `acme`, `delta`) et les tests d'intégration (orgs jetables suffixées). Sans ce module,
// les tests réécriraient le seed, et deux jeux de données divergeraient.
//
// `client` : client supabase-js sur le schéma `proto`, clé secrète (ADR-003).

import { PROTO_ORGS } from "./proto-data.mjs"

function check(result, what) {
  if (result.error) throw new Error(`[proto-seed] ${what} : ${result.error.message}`)
  return result.data
}

/**
 * Suffixe appliqué aux slugs et préfixes : "" pour les données réelles, "t3x9" pour une org de test
 * (`acme-t3x9`, préfixe `acmet3x9`, utilisateur `jb-t3x9`). Slugs et préfixes sont uniques en base.
 */
function naming(suffix) {
  return {
    org: (slug) => (suffix ? `${slug}-${suffix}` : slug),
    prefix: (prefix) => `${prefix}${suffix}`,
    user: (slug) => (suffix ? `${slug}-${suffix}` : slug),
  }
}

/** Supprime des organisations ; la cascade emporte tout ce qui en dépend. */
export async function deleteProtoOrgs(client, slugs) {
  check(await client.from("orgs").delete().in("slug", slugs), "suppression des orgs")
}

/**
 * Crée les deux organisations. Retourne, par slug de base (`acme`, `jb`…), les ids et slugs réels.
 * Les nœuds sont publiés en révision 1, avec leur ligne node_versions.
 */
export async function seedProto(client, { suffix = "" } = {}) {
  const name = naming(suffix)
  const out = { orgs: {}, users: {}, teams: {}, nodes: {} }

  for (const org of PROTO_ORGS) {
    const orgRow = check(
      await client
        .from("orgs")
        .insert({
          slug: name.org(org.slug),
          name: org.name,
          prefix: name.prefix(org.prefix),
          domains: org.domains,
          topics: org.topics,
        })
        .select()
        .single(),
      `org ${org.slug}`
    )
    out.orgs[org.slug] = orgRow

    const teamRows = check(
      await client
        .from("teams")
        .insert(org.teams.map((t) => ({ org_id: orgRow.id, slug: t.slug, name: t.name, rules: t.rules, connectors: t.connectors })))
        .select(),
      `équipes ${org.slug}`
    )
    const teamId = Object.fromEntries(teamRows.map((t) => [t.slug, t.id]))
    for (const t of teamRows) out.teams[`${org.slug}/${t.slug}`] = t

    const userRows = check(
      await client
        .from("users")
        .insert(
          org.users.map((u) => ({
            org_id: orgRow.id,
            slug: name.user(u.slug),
            name: u.name,
            role: u.role,
            default_team_id: teamId[u.default_team],
            profile: u.profile,
          }))
        )
        .select(),
      `utilisateurs ${org.slug}`
    )
    const userId = {}
    for (const u of org.users) {
      const row = userRows.find((r) => r.slug === name.user(u.slug))
      userId[u.slug] = row.id
      out.users[u.slug] = row
    }

    for (const t of org.teams) {
      check(await client.from("teams").update({ lead_user_id: userId[t.lead] }).eq("id", teamId[t.slug]), `responsable ${t.slug}`)
    }
    check(
      await client.from("team_members").insert(org.users.flatMap((u) => u.teams.map((t) => ({ team_id: teamId[t], user_id: userId[u.slug] })))),
      `membres ${org.slug}`
    )
    check(
      await client.from("vocabulary").insert(org.vocabulary.map((v) => ({ org_id: orgRow.id, term: v.term, synonyms: v.synonyms }))),
      `vocabulaire ${org.slug}`
    )

    const author = userId[org.users[0].slug]
    const nodeRows = check(
      await client
        .from("nodes")
        .insert(
          org.nodes.map((n) => ({
            org_id: orgRow.id,
            team_id: n.team ? teamId[n.team] : null,
            path: n.path,
            title: n.title,
            summary: n.summary,
            kind: n.kind,
            status: "published",
            revision: 1,
            sections: n.sections,
            meta: n.meta ?? {},
            updated_by: author,
          }))
        )
        .select("id, path"),
      `nœuds ${org.slug}`
    )
    const nodeId = Object.fromEntries(nodeRows.map((n) => [n.path, n.id]))
    for (const n of nodeRows) out.nodes[`${org.slug}/${n.path}`] = n.id

    check(
      await client.from("node_versions").insert(
        org.nodes.map((n) => ({
          node_id: nodeId[n.path],
          revision: 1,
          title: n.title,
          summary: n.summary,
          sections: n.sections,
          author,
        }))
      ),
      `versions ${org.slug}`
    )

    const phrases = org.nodes.flatMap((n) => [
      ...(n.triggers ?? []).map((phrase) => ({ node_id: nodeId[n.path], phrase, sense: "trigger" })),
      ...(n.neighbors ?? []).map((phrase) => ({ node_id: nodeId[n.path], phrase, sense: "neighbor" })),
    ])
    if (phrases.length > 0) check(await client.from("triggers").insert(phrases), `phrases ${org.slug}`)

    const rows = org.nodes.flatMap((n) => (n.rows ?? []).map((r) => ({ node_id: nodeId[n.path], key: r.key, values: r.values, provenance: {} })))
    if (rows.length > 0) check(await client.from("rows").insert(rows), `lignes ${org.slug}`)
  }

  return out
}

/** Slugs d'organisation écrits par seedProto pour ce suffixe (pour deleteProtoOrgs). */
export function protoOrgSlugs(suffix = "") {
  const name = naming(suffix)
  return PROTO_ORGS.map((org) => name.org(org.slug))
}
