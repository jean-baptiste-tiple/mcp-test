# Story E03-S07 — Fonctions d'observation et de révocation pour la campagne

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Should |
| **Référence UI** | N/A |
| **Conventions** | database, supabase, security, testing |
| **Estimation** | S |

## Contexte

Le jeton de l'API de gestion Supabase est révoqué et la CLI n'est pas connectée : ni l'éditeur SQL par script ni l'API ne sont disponibles à la session. Or la campagne doit lire ce que les hosts ont enregistré (`auth.oauth_clients` : nom, adresses de retour), voir les sessions d'un compte et révoquer ses refresh tokens (preuve 8), sans JB. Le schéma `auth` n'est pas exposé à PostgREST : des fonctions `security definer` dans `oauth_test`, réservées à `service_role`, rendent ces lectures et cette révocation accessibles au client secret (ADR-002 §3, même statut que le seed). Colonnes des tables `auth` inconnues à l'avance : les fonctions rendent des lignes en `jsonb` (`to_jsonb(ligne)`) sans les hachages de secrets, et une fonction liste les colonnes de ces tables pour le protocole. Parallèle à S02 et S03 : aucun fichier commun (nouvelle migration, nouveaux scripts, `package.json` scripts seulement).

**Refs :**
- PRD : FR-AUTH-11 (relevés, révocation), NFR-AUTH-01, NFR-AUTH-03
- Architecture : §10.3, §10.7 ; ADR-004 §6 ; ADR-002 §3
- Modèle : `supabase/migrations/20260923090100_proto_expose.sql`, `scripts/oauth-member.mjs` (S01)

## Critères d'acceptation

- [ ] **Given** la migration appliquée **Then** dans `oauth_test` : `auth_columns()` → (table_name, column_name, data_type) des tables `auth.oauth_clients`, `auth.oauth_authorizations`, `auth.oauth_consents`, `auth.sessions`, `auth.refresh_tokens`, `auth.users` (celles qui existent : `information_schema.columns`, jamais d'erreur si une table manque) ; `registered_clients()` → `setof jsonb`, une ligne par `auth.oauth_clients` sans aucune clé contenant `secret` ou `hash`, triée par `created_at` desc ; `user_sessions(p_email text)` → `setof jsonb` des lignes `auth.sessions` du compte (sans jeton) avec, pour chaque session, le nombre de `auth.refresh_tokens` et le nombre de révoqués ; `revoke_user_sessions(p_email text)` → nombre de sessions supprimées (`delete from auth.sessions where user_id = …`, cascade des refresh tokens) ; `revoke_client_grants(p_email text, p_client_name text)` → nombre de consentements ou d'autorisations supprimés pour ce compte et ce client (tables `auth.oauth_consents` / `auth.oauth_authorizations` si elles existent, sinon 0 avec un `raise notice`)
- [ ] **Given** les fonctions **Then** `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated`, `grant execute … to service_role` ; un test vérifie qu'un client à la clé publique (avec ou sans jeton utilisateur) reçoit une erreur, et que le client secret obtient un résultat
- [ ] **Given** `pnpm oauth:admin columns` **Then** le tableau des colonnes ; `pnpm oauth:admin clients` → une ligne par client (id, nom, adresses de retour, type d'enregistrement, date : clés lues dans le jsonb, affichées telles quelles) ; `pnpm oauth:admin sessions <email>` → sessions et compteurs ; `pnpm oauth:admin revoke-sessions <email>` et `revoke-grants <email> <client>` → compteur, avec `--yes` obligatoire (sinon affiche ce qui serait fait et sort en 1) ; email inconnu : erreur nommée
- [ ] **Given** un utilisateur jetable connecté par `signInWithPassword` (helpers S01) **When** `revoke_user_sessions(email)` **Then** rend ≥ 1 ; un `refreshSession` avec l'ancien refresh token échoue ; l'ancien jeton d'accès reste accepté par `verifyToken` jusqu'à `exp` (constat à consigner dans le protocole)
- [ ] **Given** `pnpm type-check`, `pnpm lint`, `pnpm test` **Then** verts

## Implémentation

### Fichiers à créer
- `supabase/migrations/<ts>_oauth_test_admin.sql` : les cinq fonctions, en-tête (ce qui casse sans elles : la campagne ne peut ni lire les clients enregistrés ni révoquer), rollback (`drop function …`)
- `scripts/lib/oauth-admin.mjs` (+ `.d.mts`) : appels `rpc` typés, mise en forme
- `scripts/oauth-admin.mjs` : `pnpm oauth:admin <columns|clients|sessions|revoke-sessions|revoke-grants> …`
- `tests/integration/auth-test-admin.test.ts` : droits (clé publique refusée), `auth_columns` non vide, `registered_clients` sans clé `secret`/`hash`, `user_sessions` puis `revoke_user_sessions` sur un utilisateur jetable, échec du `refreshSession`

### Fichiers à modifier
- `package.json` : script `oauth:admin`
- `src/types/oauth-test-database.ts` : signatures des fonctions (`Functions`)

### Opérations hors code
- `supabase db push --db-url` (comme S01, `DATABASE_URL` jamais affiché)

### Patterns à suivre
- `supabase-patterns.md` (fonctions, `security definer`, `search_path`), `security-patterns.md`
- `coding-standards.md` §Surfaces nouvelles ; `**Écarté :**` au changelog (par exemple : un jeton de gestion Supabase neuf, écarté parce qu'il n'est pas disponible à la session ; une fonction SQL générique, écartée parce qu'elle exposerait tout `auth`)
- Interdit : `src/auth-test/`, `src/app/`, `src/proto/`, `src/mcp/`, migrations existantes

## Tests attendus

### Unit tests
- [ ] N/A

### Integration tests
- [ ] `auth-test-admin.test.ts` : droits, colonnes, clients, sessions et révocation

### E2E tests
- [ ] N/A

## Post-implémentation

Implémentée le 2026-09-23 par Opus (agent) ; review isolée à venir avec le lot de corrections.

### Écarts avec l'architecture
- Pas de SQL dynamique ni de lecture d'`information_schema` dans `registered_clients` et `revoke_client_grants` : le nom du client et le tri sont lus dans le jsonb (`client_name`, sinon `name` ; `created_at`) ; une colonne absente donne « aucune correspondance » ou « pas de tri ».
- Filtre `secret|hash|token` appliqué aux clients et aux sessions (une seule règle) ; il masque `token_endpoint_auth_method` (un réglage, pas un secret : à affiner).
- Email comparé sans casse ; inconnu → `compte inconnu : <email>` (P0002), même message que `setMember`.
- CLI : `clients` affiche aussi `client_type` et `deleted_at` ; `revoke-grants` sans `--yes` vérifie le compte et liste les clients du nom.
- Consigne « `alter default privileges in schema oauth_test revoke execute on functions from public` » (review S01, B2) non appliquée : sans effet, l'`EXECUTE` à `PUBLIC` vient du défaut global de PostgreSQL (`pg_default_acl` n'a aucune entrée globale) ; chaque fonction porte un `revoke all … from public, anon, authenticated` explicite, vérifié (42501 pour la clé publique, avec ou sans jeton). La forme globale (`for role postgres`) toucherait `proto` : écartée.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `oauth_test.auth_columns()`, `registered_clients()`, `user_sessions(email)`, `revoke_user_sessions(email)`, `revoke_client_grants(email, client)` | `supabase/migrations/20260923134030_oauth_test_admin.sql` | security definer, `search_path = ''`, service_role seul |
| CLI d'observation et de révocation | `scripts/oauth-admin.mjs`, `scripts/lib/oauth-admin.mjs` | `pnpm oauth:admin columns | clients | sessions <email> | revoke-sessions <email> --yes | revoke-grants <email> <client> --yes` |
| `signInSession` | `tests/integration/auth-test-helpers.ts` | jeton d'accès + refresh token |

### Option plus simple écartée
`supabase db query --db-url` (CLI 2.117, sans jeton de gestion) : du SQL direct sans migration, écarté parce qu'il exige le mot de passe du propriétaire, rend tout `auth` lisible (hachages, refresh tokens) et dépend de `DATABASE_URL`. `auth.admin.oauth.listClients()` (clé secrète) couvre `registered_clients` sans migration : la fonction est gardée parce qu'elle rend la ligne brute, `deleted_at` compris ; c'est la moins nécessaire des cinq.

### Notes
- Checks verts (30 fichiers, 341 tests) ; migration appliquée par `db push --db-url` (dry-run : elle seule). Un premier passage des checks a échoué sur des fichiers de S02 et S03 en cours d'écriture, relancé ensuite.
- Colonnes relevées le 2026-09-23 : `auth.oauth_clients` (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type, token_endpoint_auth_method ; `id` est l'identifiant du client, pas de colonne `client_id`) ; `auth.oauth_authorizations` (id, authorization_id, client_id, user_id, redirect_uri, scope, state, **resource**, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) ; `auth.oauth_consents` (id, user_id, client_id, scopes, granted_at, revoked_at) ; `auth.sessions` (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes). État : 0 client, 0 consentement, 0 autorisation, 0 session. Jetons ES256 avec `kid`, `exp` 3 600 s ; un refresh laisse 2 lignes dans `auth.refresh_tokens` dont 1 révoquée.
- Après `revoke_user_sessions` : `refreshSession` échoue (400 `refresh_token_not_found`) ; l'ancien jeton d'accès reste accepté jusqu'à `exp` par `jwtVerify`, `getClaims` et PostgREST (RLS) ; seul `getUser` le refuse (`session_not_found`). Un host garde donc l'accès jusqu'à l'`exp` de son dernier jeton (≤ 3 600 s) ; la coupure se voit à son rafraîchissement suivant. À écrire dans le protocole.
- Compléments v2 (migration `20260923141329`, même jour) : `revoke_client_grants` supprime aussi les sessions du client (parité `revokeGrant`) ; `oauth_authorizations(email?)` et `oauth_consents(email?)` (avec `client_name` et `email`, sans `authorization_code`, `code_challenge`, `nonce`), CLI `authorizations` et `consents` ; filtre `secret|hash|hmac|refresh_token|access_token` (`token_endpoint_auth_method` visible) ; `user_sessions` avec `client_name`. Reste : les enums s'affichent `USER-DEFINED` dans `columns` ; les tests de forme ne voient encore aucune ligne réelle (tables vides avant la campagne).
