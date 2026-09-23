#!/usr/bin/env node
// Ajoute ou retire une appartenance au serveur auth-test (E03-S01, FR-AUTH-09). Sans ce script, la preuve
// « retrait puis refus » (FR-AUTH-05 : l'appel suivant est refusé, jeton encore valide) exigerait une
// requête SQL à la main pendant une campagne.
//
// Usage : pnpm oauth:member <org> <email> add|remove   (org : slug, `acme` ou `delta`)

import { createClient } from "@supabase/supabase-js"

import { readEnv } from "./lib/env.mjs"
import { setMember } from "./lib/oauth-seed.mjs"

const [org, email, action] = process.argv.slice(2)
if (!org || !email || (action !== "add" && action !== "remove")) {
  console.error("usage : pnpm oauth:member <org> <email> add|remove")
  process.exit(1)
}
const env = readEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("variables manquantes : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY")
  process.exit(1)
}
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  db: { schema: "oauth_test" },
  auth: { persistSession: false, autoRefreshToken: false },
})

try {
  const changed = await setMember(client, org, email, action)
  const outcome = action === "add" ? (changed ? "ajouté" : "déjà membre") : changed ? "retiré" : "n'était pas membre"
  console.log(`${org} : ${email} ${outcome}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  // Pas process.exit(1) ici : sous Windows, Node l'arrête sur une assertion libuv (code 127) quand
  // une connexion HTTP se ferme encore ; le processus se termine seul, avec ce code.
  process.exitCode = 1
}
