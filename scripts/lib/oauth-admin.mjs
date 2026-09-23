// Lectures et révocations du schéma `auth` pendant la campagne E03, par les fonctions `oauth_test.*` des
// migrations 20260923134030_oauth_test_admin.sql et 20260923141329_oauth_test_admin_v2.sql (E03-S07), et
// leur mise en forme. Partagé par `pnpm oauth:admin` et le test d'intégration auth-test-admin : sans ce
// module, le test n'éprouverait pas les appels ni la traduction d'erreur qu'emploie le script.
//
// `client` : client supabase-js à la clé secrète, schéma `oauth_test` (ADR-002 §3) ; toute autre clé
// est refusée par la base. Aucune valeur de secret, de code ni de jeton ne transite : la base retire ces
// clés des lignes (filtres dans l'en-tête de la v2).

/** Rend `data`. Compte inconnu (P0002) : le message de la base tel quel, « compte inconnu : <email> ». */
function check({ data, error }, what) {
  if (error) throw new Error(error.code === "P0002" ? error.message : `[oauth-admin] ${what} : ${error.message}`)
  return data
}

export async function authColumns(client) {
  return check(await client.rpc("auth_columns"), "colonnes de auth")
}

export async function registeredClients(client) {
  return check(await client.rpc("registered_clients"), "clients enregistrés")
}

export async function userSessions(client, email) {
  return check(await client.rpc("user_sessions", { p_email: email }), `sessions de ${email}`)
}

export async function revokeUserSessions(client, email) {
  return check(await client.rpc("revoke_user_sessions", { p_email: email }), `révocation des sessions de ${email}`)
}

export async function revokeClientGrants(client, email, clientName) {
  return check(
    await client.rpc("revoke_client_grants", { p_email: email, p_client_name: clientName }),
    `révocation des consentements de ${email} pour ${clientName}`
  )
}

/** Toutes les autorisations, ou celles du compte si `email` est donné. */
export async function oauthAuthorizations(client, email) {
  return check(await client.rpc("oauth_authorizations", email ? { p_email: email } : {}), `autorisations${email ? ` de ${email}` : ""}`)
}

/** Tous les consentements, ou ceux du compte si `email` est donné. */
export async function oauthConsents(client, email) {
  return check(await client.rpc("oauth_consents", email ? { p_email: email } : {}), `consentements${email ? ` de ${email}` : ""}`)
}

// Colonnes affichées : [intitulé, clés candidates]. La première clé présente dans la ligne est lue :
// les colonnes des tables `auth` changent d'une version de Supabase Auth à l'autre (`client_name`
// comme dans la fonction revoke_client_grants, sinon `name`).
const COLUMN_COLUMNS = [
  ["table", ["table_name"]],
  ["colonne", ["column_name"]],
  ["type", ["data_type"]],
]
const CLIENT_COLUMNS = [
  ["id", ["id"]],
  ["nom", ["client_name", "name"]],
  ["adresses de retour", ["redirect_uris"]],
  ["enregistrement", ["registration_type"]],
  ["type", ["client_type"]],
  ["auth. /token", ["token_endpoint_auth_method"]],
  ["créé le", ["created_at"]],
  ["supprimé le", ["deleted_at"]],
]
const SESSION_COLUMNS = [
  ["session", ["id"]],
  ["client OAuth", ["oauth_client_id"]],
  ["nom du client", ["client_name"]],
  ["créée le", ["created_at"]],
  ["rafraîchie le", ["refreshed_at"]],
  ["user agent", ["user_agent"]],
  ["ip", ["ip"]],
  ["refresh tokens", ["refresh_tokens_total"]],
  ["révoqués", ["refresh_tokens_revoked"]],
]
const AUTHORIZATION_COLUMNS = [
  ["créée le", ["created_at"]],
  ["client", ["client_name"]],
  ["compte", ["email"]],
  ["statut", ["status"]],
  ["ressource", ["resource"]],
  ["scope", ["scope"]],
  ["adresse de retour", ["redirect_uri"]],
  ["PKCE", ["code_challenge_method"]],
  ["approuvée le", ["approved_at"]],
  ["expire le", ["expires_at"]],
]
const CONSENT_COLUMNS = [
  ["accordé le", ["granted_at"]],
  ["client", ["client_name"]],
  ["compte", ["email"]],
  ["scopes", ["scopes"]],
  ["révoqué le", ["revoked_at"]],
]

/** Valeur telle que la base la rend : texte brut, JSON sinon, vide si absente. */
function cell(row, keys) {
  const key = keys.find((candidate) => candidate in row)
  const value = key === undefined ? null : row[key]
  if (value === null || value === undefined) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

/** Tableau texte : en-tête, trait, une ligne par entrée, colonnes alignées. */
function formatTable(rows, columns) {
  const header = columns.map(([label]) => label)
  const body = rows.map((row) => columns.map(([, keys]) => cell(row, keys)))
  const widths = header.map((label, i) => Math.max(label.length, ...body.map((line) => line[i].length)))
  const render = (line) => line.map((value, i) => value.padEnd(widths[i])).join("  ").trimEnd()
  return [render(header), render(widths.map((width) => "-".repeat(width))), ...body.map(render)].join("\n")
}

export function formatColumns(rows) {
  return formatTable(rows, COLUMN_COLUMNS)
}

export function formatClients(rows) {
  return formatTable(rows, CLIENT_COLUMNS)
}

export function formatSessions(rows) {
  return formatTable(rows, SESSION_COLUMNS)
}

export function formatAuthorizations(rows) {
  return formatTable(rows, AUTHORIZATION_COLUMNS)
}

export function formatConsents(rows) {
  return formatTable(rows, CONSENT_COLUMNS)
}
