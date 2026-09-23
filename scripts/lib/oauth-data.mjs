// Données du serveur auth-test (E03, architecture §10.3, ADR-004 §8) : deux organisations servies chacune
// par son nom d'hôte, deux comptes, leurs appartenances. SOURCE UNIQUE : `pnpm oauth:seed` les écrit par
// seedOauthTest() (oauth-seed.mjs), les tests en tirent des organisations jetables suffixées. Sans elles,
// aucun hôte ne résout d'organisation et la preuve « membre d'Acme, pas de Delta » n'a pas de compte.

/** Domaine Vercel rattaché à la branche e03-oauth (architecture §10.8). */
export const ACME_HOST = "mcp-test-acme.vercel.app"
/** `mcp-test-delta.vercel.app` appartient à une autre équipe Vercel : nom de repli. */
export const DELTA_HOST = "mcp-test-e03-delta.vercel.app"

/** Membre d'Acme et de Delta. */
export const JB_EMAIL = "jean-baptiste@tiple.io"
/** Alias de JB (même boîte de réception), membre d'Acme seulement : le non-membre de Delta. */
export const ALIAS_EMAIL = "jean-baptiste+acme@tiple.io"

/** `members` : emails des comptes membres ; le seed les relie aux comptes Supabase Auth de même email. */
export const OAUTH_ORGS = [
  { slug: "acme", name: "Acme Énergies", prefix: "acme", host: ACME_HOST, members: [JB_EMAIL, ALIAS_EMAIL] },
  { slug: "delta", name: "Delta Logistique", prefix: "delta", host: DELTA_HOST, members: [JB_EMAIL] },
]
