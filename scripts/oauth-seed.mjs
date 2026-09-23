#!/usr/bin/env node
// Organisations `acme` et `delta` du serveur auth-test avec leur hôte, comptes de JB et de son alias,
// appartenances (E03-S01, FR-AUTH-09). Sans ce script, aucun hôte ne résout d'organisation (404 partout)
// et personne ne peut se connecter : la campagne E03 n'a rien à mesurer. Rejouable : organisations mises
// à jour (ids gardés), comptes créés s'ils manquent (un compte existant n'est jamais modifié, mot de
// passe compris), appartenances ajoutées si elles manquent ; aucune autre ligne n'est touchée.
//
// Usage : pnpm oauth:seed   (lit NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY et OAUTH_TEST_PASSWORD
// dans .env.local ; le mot de passe n'est jamais affiché)

import { createClient } from "@supabase/supabase-js"

import { readEnv } from "./lib/env.mjs"
import { ALIAS_EMAIL, JB_EMAIL } from "./lib/oauth-data.mjs"
import { ensureUser, seedOauthTest } from "./lib/oauth-seed.mjs"

const env = readEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("variables manquantes : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY")
  process.exit(1)
}
if (!env.OAUTH_TEST_PASSWORD) {
  console.error("OAUTH_TEST_PASSWORD manquante dans .env.local : mot de passe des comptes de test (voir .env.example)")
  process.exit(1)
}

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  db: { schema: "oauth_test" },
  auth: { persistSession: false, autoRefreshToken: false },
})

for (const email of [JB_EMAIL, ALIAS_EMAIL]) {
  const { created } = await ensureUser(client, email, env.OAUTH_TEST_PASSWORD)
  console.log(`${email} : ${created ? "compte créé (mot de passe OAUTH_TEST_PASSWORD)" : "compte existant, inchangé"}`)
}

const { orgs } = await seedOauthTest(client)
const { data: members, error } = await client
  .from("members")
  .select("org_id, email")
  .in("org_id", Object.values(orgs).map((org) => org.id))
  .order("email")
if (error) throw new Error(`lecture des membres : ${error.message}`)
for (const org of Object.values(orgs)) {
  const emails = members.filter((m) => m.org_id === org.id).map((m) => m.email)
  console.log(`${org.slug} : ${org.name}, préfixe ${org.prefix}, hôte ${org.host}, membres ${emails.join(", ")}`)
}
