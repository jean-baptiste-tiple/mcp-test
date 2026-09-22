# Story E03-S01 — OAuth Supabase : consent, resource metadata, endpoint protégé, mesure par host

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — OAuth Supabase comme variable de test |
| **Parcours** | 4.2 Observer |
| **Statut** | ⬜ Draft |
| **Priorité** | Could |
| **Référence UI** | Description : page `/oauth/consent` minimale (nom du client, scopes, boutons Autoriser / Refuser), login Supabase email/mot de passe avant |
| **Conventions** | mcp, auth, supabase, security, nextjs |
| **Estimation** | L |

## Contexte

À ouvrir après E01-S04. Supabase OAuth Server est déjà configuré côté dashboard (authorization path `/oauth/consent`, DCR activé, site URL `https://mcp-test-navy.vercel.app`). La story installe la partie login du starter supabase-auth, la page de consentement, la metadata RFC 9728, `withMcpAuth` et l'ajout de `user_id` au journal ; puis mesure si la connexion ou la ré-authentification déclenche une relecture des métadonnées.

**Refs :** starter mcp (auth.ts, oauth-protected-resource-route.ts, bloc `withMcpAuth`), mcp-patterns §6.

## Critères d'acceptation (à affiner à l'ouverture)

- [ ] **Given** un host sans token **When** il appelle `/api/mcp` **Then** 401 + `WWW-Authenticate` et le flow OAuth démarre sur les 4 hosts
- [ ] **Given** un token valide **When** `tools/call` **Then** `bench_events.user_id` est renseigné

## Implémentation

À définir à l'ouverture.

## Tests attendus

À définir à l'ouverture.
