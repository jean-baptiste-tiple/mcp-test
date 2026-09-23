#!/usr/bin/env node
// Remplace les organisations `acme` et `delta` du schéma `proto` par les données de
// scripts/lib/proto-data.mjs (E04-S01). Sans ce script, les hosts n'auraient aucun utilisateur
// derrière /api/proto/u/jb/mcp et /api/proto/u/jb-delta/mcp. Le journal et les ctx de ces orgs
// partent avec elles (cascade) : à lancer entre deux campagnes, jamais pendant. Non transactionnel :
// un échec en cours de route laisse une org incomplète, relancer le script suffit.
//
// Usage : pnpm proto:seed   (lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local)

import { createClient } from "@supabase/supabase-js"

import { readEnv } from "./lib/env.mjs"
import { deleteProtoOrgs, protoOrgSlugs, seedProto } from "./lib/proto-seed.mjs"

const env = readEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("variables manquantes : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY")
  process.exit(1)
}

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  db: { schema: "proto" },
  auth: { persistSession: false, autoRefreshToken: false },
})

await deleteProtoOrgs(client, protoOrgSlugs())
const result = await seedProto(client)
for (const [slug, org] of Object.entries(result.orgs)) {
  const users = Object.values(result.users).filter((u) => u.org_id === org.id).map((u) => u.slug)
  console.log(`${slug} : préfixe ${org.prefix}, utilisateurs ${users.join(", ")}`)
}
