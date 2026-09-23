# Story E03-S01 — Schéma `oauth_test`, seed, scripts, journal

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | database, supabase, security, typescript, testing |
| **Estimation** | M |

## Contexte

Socle partagé par S02 (serveur protégé) et S03 (pages) : les trois tables, leur RLS, l'exposition du schéma à PostgREST, les types, le seed, le script de membres et le module journal. Une fois S01 posée, S02 et S03 n'ont plus aucun fichier en commun.

Le serveur auth-test tourne sur le Supabase du banc, à côté des tables `bench_*` et du schéma `proto` (E04, campagne en cours) : rien de S01 ne les touche, et la migration ne fait qu'ajouter un schéma. L'exposition PostgREST reprend la liste posée par `20260923090100_proto_expose.sql` en y ajoutant `oauth_test` (`proto` conservé).

**Refs :**
- PRD : FR-AUTH-01 (table `orgs`), FR-AUTH-05 (RLS `members`), FR-AUTH-07 (journal), FR-AUTH-09 (seed, script membres), NFR-AUTH-01, NFR-AUTH-02
- Architecture : §10.2, §10.3, §10.6, §10.7 ; ADR-004 §4, §5, §6, §8 ; ADR-002 §3 (clé secrète hors tools)
- Modèle : migration `20260923090000_proto.sql` (en-tête, RLS, grants), `scripts/lib/proto-seed.mjs`, `tests/integration/proto-helpers.ts`, `src/proto/services/journal.ts`

## Critères d'acceptation

- [ ] **Given** la migration appliquée **When** on inspecte `oauth_test` **Then** `orgs` (id, slug unique, name, prefix unique `^[a-z][a-z0-9]{1,11}$`, host unique en minuscules sans port, created_at), `members` (org_id → orgs cascade, user_id → auth.users cascade, email, role text default 'member', unique (org_id, user_id), created_at), `journal` (id bigint identity, ts, host, path, method, tool, decision check in (`unauthenticated`, `invalid_token`, `unknown_host`, `allowed`, `denied_not_member`, `consent`, `metadata`), reason, user_id, email, org_slug, client_id, client_name, token jsonb, consent jsonb, user_agent, ip) existent ; RLS activée sur les trois ; policies select pour `authenticated` : `orgs` limité aux organisations dont l'utilisateur est membre, `members` où `user_id = auth.uid()` ; aucune policy sur `journal` ; privilèges : `usage` + select sur `orgs` et `members` à `authenticated`, tout à `service_role`, rien à `anon`
- [ ] **Given** la migration **Then** `pgrst.db_schemas` du rôle `authenticator` = liste actuelle + `oauth_test` (`proto` conservé, vérifié par un test qui lit `proto.orgs` avec la clé secrète après migration) ; `notify pgrst, 'reload config'`
- [ ] **Given** `pnpm oauth:seed` **When** relancé deux fois **Then** mêmes lignes : `acme` (« Acme Énergies », `acme`, hôte `ACME_HOST`) et `delta` (« Delta Logistique », `delta`, hôte `DELTA_HOST`) ; utilisateurs `jean-baptiste@tiple.io` et l'alias (constante `ALIAS_EMAIL` de `oauth-data.mjs`) créés s'ils manquent par `auth.admin.createUser({ email, password: OAUTH_TEST_PASSWORD, email_confirm: true })`, existants non modifiés ; `OAUTH_TEST_PASSWORD` lu dans `.env.local` par `readEnv`, absent = erreur nommée, jamais affiché ; JB membre des deux, alias membre d'Acme seulement ; aucune ligne de `bench_*`, `proto.*` ni autre `auth.users` touchée
- [ ] **Given** `pnpm oauth:member delta <email> remove` **Then** la ligne disparaît ; `add` la recrée ; email inconnu ou organisation inconnue : erreur nommée, code de sortie 1
- [ ] **Given** un client Supabase construit avec le jeton d'un utilisateur A (`Authorization: Bearer`, clé publique) **When** il lit `members` **Then** ses lignes seulement ; `orgs` : ses organisations seulement ; un insert ou un delete est refusé ; avec la clé publique sans jeton : rien
- [ ] **Given** `resolveOrg(db, host)` **Then** l'organisation dont `host` = hôte normalisé (minuscules, sans port, sans espaces) ou `null`, sans autre requête ; `isMember(userDb, orgId)` sous le jeton de l'utilisateur rend `true`/`false` par la seule RLS (pas de `user_id` passé en argument)
- [ ] **Given** `flushJournal(db, entries)` **Then** une ligne par entrée, `token` jsonb limité aux clés `iss, aud, sub, email, client_id, session_id, iat, exp, amr, scope` (un test refuse toute autre clé, dont `raw`, `access_token`) ; échec d'insertion = `console.error`, jamais de throw
- [ ] **Given** `pnpm type-check`, `pnpm lint`, `pnpm test` **Then** verts ; les tests d'intégration sont sautés avec un message si `.env.local` n'a pas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SECRET_KEY`

## Implémentation

### Fichiers à créer
- `supabase/migrations/<ts>_oauth_test.sql` : schéma, tables, RLS, policies, grants, exposition PostgREST ; en-tête : ce qui casse sans chaque table, rollback (`drop schema oauth_test cascade` + `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, proto'`)
- `scripts/lib/oauth-data.mjs` (+ `.d.mts`) : `ACME_HOST`, `DELTA_HOST` (`mcp-test-acme.vercel.app`, `mcp-test-e03-delta.vercel.app` ; domaines déjà rattachés à la branche), `JB_EMAIL`, `ALIAS_EMAIL` (`jean-baptiste+acme@tiple.io`, à confirmer par JB), organisations, appartenances
- `scripts/lib/oauth-seed.mjs` (+ `.d.mts`) : `seedOauthTest(client, { suffix = "" })` (orgs et hôtes suffixés pour les tests : `acme-<suffix>.test`), `ensureUser(client, email, password)`, `deleteOauthTestOrgs(client, slugs)`, `setMember(client, orgSlug, email, "add" | "remove")`
- `scripts/oauth-seed.mjs` : `pnpm oauth:seed` (lit `.env.local` par `scripts/lib/env.mjs`)
- `scripts/oauth-member.mjs` : `pnpm oauth:member <org> <email> add|remove`
- `src/types/oauth-test-database.ts` : au format `gen types` (écrit à la main comme `proto-database.ts`)
- `src/auth-test/db.ts` : `OauthTestDb`, `userClient(token)` (clé publique + `Authorization: Bearer`, `persistSession: false`, schéma `oauth_test`) ; `must/many/one` : réutiliser ceux de `src/proto/db.ts` seulement s'ils s'importent sans dépendance proto, sinon copie minimale commentée
- `src/auth-test/orgs.ts` : `normalizeHost`, `resolveOrg`, `isMember`
- `src/auth-test/journal.ts` : `JournalEntry`, `TokenSummary`, `summarizeClaims(payload)`, `flushJournal`
- `tests/integration/auth-test-helpers.ts` : `hasDb`, `testDb()`, `seedTestOrgs(db)` (suffixe, hôtes jetables, `drop`), `createTestUser(db)` (`auth.admin.createUser` avec un email `e03-<rand>@example.test` et un mot de passe aléatoire, `remove`), `signIn(email, password)` → jeton d'accès (`signInWithPassword`, client public)
- `tests/integration/auth-test-schema.test.ts` : seed idempotent, `resolveOrg`, RLS de `members` et `orgs` (utilisateur jetable), `isMember`, `flushJournal`, `proto.orgs` toujours lisible
- `tests/unit/auth-test-journal.test.ts` : `summarizeClaims` (clés admises, jamais le jeton), `normalizeHost`

### Fichiers à modifier
- `src/lib/supabase/admin.ts` : `getOauthTestClient()` typé `OauthTestDatabase, "oauth_test"` (même motif que `getProtoClient`) : journal, scripts, page de consentement
- `package.json` : scripts `oauth:seed`, `oauth:member`
- `.env.example` : `OAUTH_TEST_PASSWORD` (commentaire : seed des deux comptes de test)
- `docs/architecture.md` §10.3 si l'implémentation s'en écarte

### Opérations hors code
- Appliquer la migration sur le Supabase du banc : `supabase db push --db-url "$DATABASE_URL"` avec `DATABASE_URL` lu dans `.env.local` sans l'afficher (le jeton de la CLI est révoqué), à un moment convenu avec JB : le `notify pgrst` recharge la configuration pendant la campagne E04. Si le mot de passe a été changé depuis E04-S01, JB pousse lui-même.
- `pnpm oauth:seed` après que JB a mis `OAUTH_TEST_PASSWORD` dans `.env.local` et confirmé l'email de l'alias.

### Patterns à suivre
- `database-patterns.md`, `supabase-patterns.md` (policies, `auth.uid()`), `security-patterns.md` (secrets)
- `coding-standards.md` §Surfaces nouvelles : en-tête de chaque fichier ; changelog avec `**Écarté :**`
- Interdit : toucher `src/proto/`, `src/mcp/`, `src/app/api/`, les migrations existantes

## Tests attendus

### Unit tests
- [ ] `auth-test-journal.test.ts` : résumé de claims (clés admises), `normalizeHost`

### Integration tests
- [ ] `auth-test-schema.test.ts` : seed idempotent ; `resolveOrg` ; RLS `members` et `orgs` sous jeton d'un utilisateur jetable, insert refusé, anon rien ; `isMember` ; `flushJournal` (ligne écrite, échec silencieux) ; `proto.orgs` lisible après migration

### E2E tests
- [ ] N/A (S04 : smoke HTTP)

## Post-implémentation

Implémentée le 2026-09-23 par Opus (agent) ; review isolée : voir Notes.

### Écarts avec l'architecture
- Exposition PostgREST en tête de migration : le premier `create` déclenche un `reload schema` ; placée en fin, le `reload config` arrivait après et le cache gardait l'ancienne liste (cas d'E04-S01, rechargé à la main).
- `members` : clé primaire `(org_id, user_id)` ; `orgs.host` : check `^[a-z0-9.-]+$` ; `journal` : `host`, `path`, `method` nullables, `user_id` et `org_slug` sans clé étrangère (le journal survit aux suppressions), aucun index.
- `seedOauthTest` avec suffixe ne crée ni appartenance ni compte (les tests ajoutent leurs utilisateurs jetables par `setMember`) ; `ensureUser` rend `{ id, created }` ; `setMember` rend `true` si la table a changé ; `resolveOrg` rend `null` sans requête sur un hôte vide ; `flushJournal` insère avec `defaultToNull: false`.
- Helpers en plus de la story : `anonDb()`, `stubPublicEnv()` (`userClient` lit `process.env` comme sous Next).
- `oauth-member.mjs` : `process.exitCode = 1` au lieu de `process.exit(1)` (sous Windows, `process.exit` après un appel réseau finissait en assertion libuv, code 127).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| Schéma `oauth_test` (orgs, members, journal), RLS, policies, exposition PostgREST | `supabase/migrations/20260923131211_oauth_test.sql` | `pgrst.db_schemas = public, graphql_public, proto, oauth_test` |
| Données, seed, membres | `scripts/lib/oauth-data.mjs`, `scripts/lib/oauth-seed.mjs`, `scripts/oauth-seed.mjs`, `scripts/oauth-member.mjs` | `pnpm oauth:seed`, `pnpm oauth:member <org> <email> add|remove` |
| getOauthTestClient | `src/lib/supabase/admin.ts` | journal, scripts, page de consentement |
| db, orgs, journal | `src/auth-test/db.ts`, `orgs.ts`, `journal.ts` | `userClient(token)`, `resolveOrg`, `isMember`, `summarizeClaims`, `flushJournal` |
| Helpers de test | `tests/integration/auth-test-helpers.ts` | orgs et hôtes jetables, utilisateurs jetables, `signIn`, `anonDb`, `stubPublicEnv` |

### Option plus simple écartée
Un `summarizeClaims` qui copie les clés admises sans vérifier leur type : S02 calcule `expires_in_s` depuis `exp`, et une valeur inattendue (un objet dans `sub`) irait droit au journal ; un test couvre ce cas.

### Notes
- Checks : `pnpm type-check`, `pnpm lint`, `pnpm test` verts (21 fichiers, 238 tests). Migration appliquée par `db push --db-url` (dry-run : elle seule) ; `pgrst.db_schemas` relu ; seed joué deux fois, mêmes ids et dates ; trois appartenances (JB × 2, alias × 1) ; `bench_*` et `proto.*` intacts ; les tests ne laissent rien.
- Comptes JB et alias créés avec le mot de passe `OAUTH_TEST_PASSWORD`, généré par l'agent et écrit dans `.env.local` du worktree (jamais affiché) ; alias `jean-baptiste+acme@tiple.io` créé sans confirmation préalable de JB (à confirmer, sinon suppression du compte et nouveau seed). Le moment du push (rechargement PostgREST pendant la campagne E04) n'a pas été convenu : JB avait demandé d'avancer seul le 2026-09-23.
- La base connaît la migration `20260923131211` que `main` n'a pas : un `db push` depuis `main` sera refusé tant qu'elle n'y est pas (fusion d'E03) ; jamais de `migration repair --status reverted`.
- Pour S02 : `isMember` rend un booléen, whoami a besoin du rôle (`membership()` ajouté en S02). Pour S07 : `signIn` ne rend que le jeton d'accès (`signInSession` ajouté en S07).
- Dette mineure, signalée : contrôle des variables d'environnement répété trois fois dans `admin.ts` ; `oauth-seed.mjs` laisse remonter ses erreurs réseau (code 127 possible sous Windows).
- Review isolée (2026-09-23) : 0 HAUTE, 5 MOYENNE, 8 BASSE, toutes traitées le jour même : `JournalEntry.token` typé `TokenSummary` et `flushJournal` repasse `summarizeClaims` (M1) ; test `ensureUser` (M2) ; `members.role` supprimée par la migration `20260923141229` (M3, aucun consommateur ; l'AC 1 ci-dessus la mentionnait encore) ; registre (M4) ; traçabilité (M5, ci-dessus) ; `amr` filtré, nettoyage `try/finally` et `allSettled`, assertions d'erreur, logs réduits à `{ code, message }`, en-tête d'`admin.ts`.
