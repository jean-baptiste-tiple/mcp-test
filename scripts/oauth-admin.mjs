#!/usr/bin/env node
// Observation et révocation des connexions OAuth pendant la campagne E03 (E03-S07, FR-AUTH-11). Sans ce
// script, relever les clients qu'un host a enregistrés et les sessions d'un compte, ou révoquer ses
// refresh tokens (preuve 8), exigerait du SQL à la main par le mot de passe de la base ou par JB : le
// jeton de l'API de gestion Supabase est révoqué et `auth` n'est pas exposé à PostgREST.
//
// Usage :
//   pnpm oauth:admin columns                                colonnes des tables auth du serveur OAuth
//   pnpm oauth:admin clients                                clients enregistrés, les plus récents d'abord
//   pnpm oauth:admin sessions <email>                       sessions du compte, client, refresh tokens, révoqués
//   pnpm oauth:admin authorizations [email]                 autorisations (toutes, ou du compte), les plus récentes d'abord
//   pnpm oauth:admin consents [email]                       consentements (tous, ou du compte), les plus récents d'abord
//   pnpm oauth:admin revoke-sessions <email> --yes          supprime toutes les sessions du compte
//   pnpm oauth:admin revoke-grants <email> <client> --yes   supprime consentements, autorisations et sessions
//                                                           du compte pour le client nommé <client>
// Sans --yes, une révocation affiche ce qu'elle ferait et sort en 1. Aucune valeur de secret, de code ni
// de jeton n'est lue.

import { createClient } from "@supabase/supabase-js"

import { readEnv } from "./lib/env.mjs"
import {
  authColumns,
  formatAuthorizations,
  formatClients,
  formatColumns,
  formatConsents,
  formatSessions,
  oauthAuthorizations,
  oauthConsents,
  registeredClients,
  revokeClientGrants,
  revokeUserSessions,
  userSessions,
} from "./lib/oauth-admin.mjs"

const USAGE =
  "usage : pnpm oauth:admin columns | clients | sessions <email> | authorizations [email] | consents [email] | revoke-sessions <email> --yes | revoke-grants <email> <client> --yes"
/** Nombre d'arguments après la commande (hors --yes) : [minimum, maximum]. */
const ARITY = {
  columns: [0, 0],
  clients: [0, 0],
  sessions: [1, 1],
  authorizations: [0, 1],
  consents: [0, 1],
  "revoke-sessions": [1, 1],
  "revoke-grants": [2, 2],
}

async function run(client, command, [email, clientName], yes) {
  if (command === "columns") {
    console.log(formatColumns(await authColumns(client)))
    return 0
  }
  if (command === "clients") {
    const rows = await registeredClients(client)
    console.log(rows.length > 0 ? formatClients(rows) : "aucun client enregistré")
    return 0
  }
  if (command === "sessions") {
    const rows = await userSessions(client, email)
    console.log(rows.length > 0 ? formatSessions(rows) : `aucune session pour ${email}`)
    return 0
  }
  if (command === "authorizations") {
    const rows = await oauthAuthorizations(client, email)
    console.log(rows.length > 0 ? formatAuthorizations(rows) : `aucune autorisation${email ? ` pour ${email}` : ""}`)
    return 0
  }
  if (command === "consents") {
    const rows = await oauthConsents(client, email)
    console.log(rows.length > 0 ? formatConsents(rows) : `aucun consentement${email ? ` pour ${email}` : ""}`)
    return 0
  }
  if (command === "revoke-sessions") {
    if (!yes) {
      const rows = await userSessions(client, email)
      if (rows.length > 0) console.log(formatSessions(rows))
      console.log(`${rows.length} session(s) de ${email} seraient supprimées, refresh tokens compris. Relancer avec --yes pour révoquer.`)
      return 1
    }
    const count = await revokeUserSessions(client, email)
    console.log(`${count} session(s) de ${email} supprimée(s), refresh tokens compris.`)
    return 0
  }
  // revoke-grants
  if (!yes) {
    // Compte inconnu : même erreur nommée qu'avec --yes (chaque lecture par compte la lève).
    const [consents, authorizations, sessions] = (
      await Promise.all([oauthConsents(client, email), oauthAuthorizations(client, email), userSessions(client, email)])
    ).map((rows) => rows.filter((row) => row.client_name === clientName))
    const named = (await registeredClients(client)).filter((row) => (row.client_name ?? row.name) === clientName)
    if (named.length > 0) console.log(formatClients(named))
    if (sessions.length > 0) console.log(formatSessions(sessions))
    console.log(
      `Supprimerait, pour ${email} et « ${clientName} » (${named.length} client(s) sous ce nom) : ${consents.length} consentement(s), ${authorizations.length} autorisation(s), ${sessions.length} session(s) avec leurs refresh tokens. Relancer avec --yes pour révoquer.`
    )
    return 1
  }
  const count = await revokeClientGrants(client, email, clientName)
  console.log(`${count} consentement(s), autorisation(s) ou session(s) de ${email} pour « ${clientName} » supprimé(s), refresh tokens compris.`)
  return 0
}

const args = process.argv.slice(2)
const yes = args.includes("--yes")
const [command, ...params] = args.filter((arg) => arg !== "--yes")
const env = readEnv()

// hasOwn, pas `in` : `toString` et les autres clés héritées ne sont pas des commandes.
if (!Object.hasOwn(ARITY, command) || params.length < ARITY[command][0] || params.length > ARITY[command][1]) {
  console.error(USAGE)
  process.exitCode = 1
} else if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("variables manquantes : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY")
  process.exitCode = 1
} else {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    db: { schema: "oauth_test" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    process.exitCode = await run(client, command, params, yes)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    // Pas process.exit(1) : sous Windows, Node l'arrête sur une assertion libuv (code 127) quand une
    // connexion HTTP se ferme encore (voir oauth-member.mjs) ; le processus se termine seul, avec ce code.
    process.exitCode = 1
  }
}
