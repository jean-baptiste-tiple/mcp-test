# Epic E03 — OAuth Supabase comme variable de test

| Champ | Valeur |
|-------|--------|
| **ID** | E03 |
| **Priorité** | P2 |
| **Statut** | ⬜ Draft |
| **Parcours** | 4.2 Observer |
| **PRD Refs** | FR-OBS-01 (dimension auth) |
| **Référence UI** | Description texte : page de consentement minimale (login Supabase puis approve/deny) |
| **Dépendances** | E01 |

## Objectif

Mesurer si la connexion OAuth (ou une ré-authentification) déclenche une relecture des métadonnées par le host, et si le flow DCR de chaque host fonctionne avec Supabase OAuth Server.

## Périmètre

### IN
- Starter supabase-auth (login uniquement), page `/oauth/consent` (Supabase `getAuthorizationDetails` / `approveAuthorization`), `/.well-known/oauth-protected-resource`, `withMcpAuth` sur un second scénario ou un second endpoint.
- Journal : `user_id` du token dans `bench_events`.

### OUT
- Signup, reset password, RLS par utilisateur.

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E03-S01 | OAuth Supabase : consent, resource metadata, endpoint protégé, mesure par host | L | ⬜ | E01-S04 |
