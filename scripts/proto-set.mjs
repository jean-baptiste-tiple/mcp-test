#!/usr/bin/env node
// Bascules des mesures du serveur proto, sans redéploiement (E04-S05). Sans ce script, les mesures 5
// (ctx périmé en pleine conversation), 6 (domaines dans la description de context) et 7 (ton servi
// par context) exigeraient une requête SQL à la main pendant une campagne.
//
// Usage :
//   pnpm proto:set <org> domains "<texte>"   domaines nommés par <prefix>_context (mesure 6)
//   pnpm proto:set <org> domains null        description sans domaines
//   pnpm proto:set <org> rules bump          version des règles + 1 : invalide les ctx en cours (mesure 5)
//   pnpm proto:set <utilisateur> ton "<texte>" ton servi dans le bloc personne (mesure 7)
//   pnpm proto:set acme prospects reset      file ventes/suivi_prospects remise à l'état du seed, journal
//                                             gardé (D4 la consomme : sinon une golden query ne se rejoue pas)

import { createClient } from "@supabase/supabase-js"

import { readEnv } from "./lib/env.mjs"
import { PROTO_ORGS } from "./lib/proto-data.mjs"

const [target, key, value] = process.argv.slice(2)
const env = readEnv()
if (!target || !key || value === undefined) {
  console.error('usage : pnpm proto:set <org> domains "<texte>"|null | <org> rules bump | <org> prospects reset | <utilisateur> ton "<texte>"')
  process.exit(1)
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("variables manquantes : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY")
  process.exit(1)
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  db: { schema: "proto" },
  auth: { persistSession: false, autoRefreshToken: false },
})

function check({ data, error }, what) {
  if (error) throw new Error(`${what} : ${error.message}`)
  if (data === null) throw new Error(`${what} : introuvable`)
  return data
}

if (key === "domains" || key === "rules") {
  const org = check(await db.from("orgs").select("id, domains, rules_version").eq("slug", target).maybeSingle(), `org ${target}`)
  if (key === "domains") {
    const next = value === "null" ? null : value
    check(await db.from("orgs").update({ domains: next }).eq("id", org.id).select("id"), "mise à jour")
    console.log(`${target}.domains : ${JSON.stringify(org.domains)} → ${JSON.stringify(next)}`)
    console.log("Geste de rafraîchissement du host requis pour voir la nouvelle description (mcp-patterns §8).")
  } else if (value === "bump") {
    check(await db.from("orgs").update({ rules_version: org.rules_version + 1 }).eq("id", org.id).select("id"), "mise à jour")
    console.log(`${target}.rules_version : ${org.rules_version} → ${org.rules_version + 1} (les ctx en cours sont périmés)`)
  } else {
    console.error("rules accepte seulement : bump")
    process.exit(1)
  }
} else if (key === "prospects" && value === "reset") {
  const org = check(await db.from("orgs").select("id").eq("slug", target).maybeSingle(), `org ${target}`)
  const node = check(await db.from("nodes").select("id").eq("org_id", org.id).eq("path", "ventes/suivi_prospects").maybeSingle(), "tableau")
  const seed = PROTO_ORGS.find((o) => o.slug === target)?.nodes.find((n) => n.path === "ventes/suivi_prospects")?.rows
  if (!seed) throw new Error(`pas de données de seed pour ${target}`)
  check(await db.from("rows").delete().eq("node_id", node.id).select("id"), "suppression")
  check(await db.from("rows").insert(seed.map((r) => ({ node_id: node.id, key: r.key, values: r.values, provenance: {} }))).select("id"), "insertion")
  console.log(`${target} ventes/suivi_prospects : ${seed.length} lignes remises à l'état du seed`)
} else if (key === "ton") {
  const user = check(await db.from("users").select("id, profile").eq("slug", target).maybeSingle(), `utilisateur ${target}`)
  const profile = { ...(user.profile ?? {}), ton: value }
  check(await db.from("users").update({ profile }).eq("id", user.id).select("id"), "mise à jour")
  console.log(`${target}.ton : ${JSON.stringify(user.profile?.ton ?? null)} → ${JSON.stringify(value)}`)
} else {
  console.error(`clé inconnue : ${key} (domains, rules, ton, prospects)`)
  process.exit(1)
}
