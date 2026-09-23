# Story E04-S01 — Socle proto : schéma, données, identité par URL, six outils déclarés, context, ctx, feedback, journal

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, security, typescript, testing |
| **Estimation** | L |

## Contexte

Pose tout ce dont les stories suivantes ont besoin : le schéma `proto` complet, les données des deux clients fictifs, la route par utilisateur, les six outils déclarés (noms, descriptions, schémas), la vérification du ctx, le journal, et deux outils complets : `context` (sans routage, qui arrive en S02) et `feedback`. `find`, `read`, `write` et `call` sont déclarés et répondent « not available yet » (erreur actionnable) jusqu'à S02, S03 et S04 : les déclarer ici fige la surface mesurée (preuve 8) et laisse les trois stories suivantes sans fichier commun.

**Refs :**
- PRD : FR-PROTO-01, 02, 03, 04 (hors étapes), 12, 13, 14, 15
- Architecture : §9 entière ; ADR-001 (stateless), ADR-003
- Docs cible : [fonctionnelle](https://claude.ai/artifact/Hjg9VEJ5EMwtDu8nqJ7PYg) (« Les six outils », « Ce que renvoie context »), [technique](https://claude.ai/artifact/Dumt9aN5erv1eGtiPq14ZK) (« Entités »)

## Critères d'acceptation

- [x] **Given** la migration appliquée **When** on inspecte `proto` **Then** les 13 tables d'architecture §9.3 existent avec leurs checks, FK cascade vers `orgs`, index GIN (trigrammes sur `triggers.norm`, plein texte sur `triggers.tsv`), RLS activée, zéro policy, privilèges à `service_role` seulement ; `proto.norm` et la configuration `proto.fr` existent ; `anon` ne lit rien
- [x] **Given** `pnpm proto:seed` **When** relancé deux fois **Then** mêmes données (orgs `acme` et `delta` supprimées puis recréées), aucune autre org touchée
- [x] **Given** les données **Then** Acme : 3 équipes (Ventes, Support, Conseil), 4 utilisateurs (`jb` admin membre des trois équipes, défaut Conseil ; `claire` responsable Ventes ; `paul` responsable Support ; `lea` Ventes), 10 procédures publiées dont 3 paires voisines (relance_devis / relance_prospects, reponse_ticket / escalade_incident, preparer_rdv / compte_rendu_rdv), chacune avec 4 à 6 phrases déclencheuses et 2 à 3 voisines, une page `guide` (Mission, Vocabulaire, Règles, Ton), une page longue `conseil/methode_etude` (au moins 12 sections, plus de 25 000 caractères), `support/faq`, `conseil/grille_tarifaire_2026`, `ventes/modele_relance`, le tableau `ventes/suivi_prospects` (12 lignes, colonne d'état `statut` : à traiter, en cours, relancé, gagné, perdu), un vocabulaire (au moins 6 termes), des sujets ; Delta Logistique (préfixe `delta`) : une équipe Exploitation, l'utilisateur `jb-delta`, 3 procédures d'un autre domaine (tournées, stocks, incidents de livraison), un guide ; aucun nom de client réel
- [x] **Given** `POST /api/proto/u/jb/mcp` `initialize` puis `tools/list` **Then** serverInfo `acme-proto`, titre « Acme Énergies », instructions d'une phrase renvoyant à `acme_context`, exactement six outils `acme_context`, `acme_find`, `acme_read`, `acme_call`, `acme_write`, `acme_feedback` ; pour `/u/jb-delta/mcp`, les six `delta_*`
- [x] **Given** un slug inconnu **When** n'importe quelle requête **Then** erreur JSON-RPC « Unknown user » (HTTP 404), aucune donnée divulguée
- [x] **Given** les deux listes **Then** (preuve 8) noms `^[a-z0-9_]{1,64}$`, aucune intersection entre Acme et Delta, descriptions < 1 000 caractères, les cinq outils autres que context commencent exactement par « Requires the ctx code from <prefix>_context; call it first. », `ctx` est `required` dans leur inputSchema, aucun schéma n'a d'objet imbriqué décrit hors `write.ops` et `call.arguments`
- [x] **Given** `acme_context` sans phrase **When** appelé **Then** une ligne `proto.ctx` (utilisateur, organisation, rules_version, user-agent) et un texte qui commence par le code, puis les blocs personne, organisation, équipe, nouveautés, procédures utiles, documents récents, par sujet ; ≤ 20 000 caractères (preuve 3)
- [x] **Given** `buildContext` avec un budget de 1 500 caractères **Then** le bloc code est entier, les blocs de fin sont omis d'abord, une dernière ligne nomme les blocs omis (preuve 3)
- [x] **Given** `acme_feedback` sans ctx, avec un ctx inconnu, ou avec le ctx d'un autre utilisateur **Then** `isError` avec « Missing or unknown ctx. Call acme_context first and pass its ctx code. » (preuve 1 ; `find`, `read`, `write`, `call` passent par la même garde avant leur réponse « not available yet »)
- [x] **Given** un ctx valide **When** `rules_version` de l'organisation est incrémentée **Then** l'appel suivant reçoit « context has changed, call acme_context again » (preuve 2)
- [x] **Given** `acme_feedback {ctx, type: "gap", text}` **Then** une ligne `proto.feedback` et un texte « Ticket FB-<n> recorded. »
- [x] **Given** chaque outil appelé avec succès **Then** `structuredContent.text === content[0].text` (preuve 5, pour context et feedback ici)
- [x] **Given** chaque requête traitée (initialize, tools/list, tools/call) **Then** une ligne `proto.journal` avec method, tool, target, ctx, user, team, args (≤ 2 ko), args_chars, result_chars, is_error, error, duration_ms, client_name (initialize), user_agent ; un journal en échec ne change pas la réponse
- [x] **Given** `/api/mcp` du banc **When** `pnpm mcp:smoke` **Then** inchangé

## Implémentation

### Fichiers à créer
- `supabase/migrations/<ts>_proto.sql` : extensions, `proto.norm`, `proto.fr`, 13 tables, index, RLS, grants ; en-tête qui justifie les colonnes lues seulement par S02 à S04
- `scripts/lib/proto-data.mjs` (+ `.d.mts`) : les deux jeux de données
- `scripts/lib/proto-seed.mjs` (+ `.d.mts`) : `seedProto(client, { suffix = "" })` crée les orgs, équipes, utilisateurs (slugs suffixés), nœuds publiés avec leur version 1, phrases, vocabulaire, lignes ; `deleteProtoOrgs(client, slugs)`
- `scripts/proto-seed.mjs` : lit `.env.local`, supprime `acme` et `delta`, `seedProto`
- `src/types/proto-database.ts` : `supabase gen types typescript --linked --schema proto`
- `src/proto/schemas.ts`, `db.ts`, `identity.ts`
- `src/proto/services/ctx.ts`, `context.ts`, `feedback.ts`, `journal.ts`
- `src/proto/mcp/tools.ts`, `server.ts`
- `src/app/api/proto/u/[user]/[transport]/route.ts`
- `tests/unit/proto-tools.test.ts` (preuve 8), `tests/integration/proto-core.test.ts` (preuves 1, 2, 3, 5 pour context et feedback), `tests/integration/proto-helpers.ts` (org jetable, client MCP `InMemoryTransport`)

### Fichiers à modifier
- `package.json` : scripts `proto:seed`, `db:types:proto`
- `docs/architecture.md` §9 si l'implémentation s'en écarte ; `README.md` : section serveur proto (URL, seed, ADR-003)

### Opérations hors code
- Exposer `proto` à PostgREST : `PATCH https://api.supabase.com/v1/projects/nwdmkehnxvqyxddgogtu/postgrest` avec `db_schema` = valeur actuelle + `,proto`, jeton `SUPABASE_ACCESS_TOKEN` lu dans `.env.local` sans l'afficher ; relire la config après
- `pnpm db:push`, puis `pnpm proto:seed`

### Patterns à suivre
- `.claude/conventions/mcp-patterns.md` §2.1, §3, §4, §7, §10 ; handlers bas niveau comme `src/mcp/server.ts` (la garde ctx doit rendre notre message, pas l'erreur de validation du SDK)
- `.claude/conventions/database-patterns.md`, `supabase-patterns.md`, `security-patterns.md`
- `coding-standards.md` §Surfaces nouvelles : chaque fichier ouvre sur ce qui casse sans lui

## Tests attendus

### Unit tests
- [x] `proto-tools.test.ts` : preuve 8 sur Acme et Delta (définitions calculées sans base)

### Integration tests
- [x] `proto-core.test.ts` (org jetable) : slug inconnu ; tools/list ; preuves 1, 2, 3, 5 ; feedback ; journal écrit ; journal en échec sans effet

### E2E tests
- [x] Smoke HTTP : `pnpm mcp:smoke` inchangé sur `/api/mcp` ; initialize + tools/list + `acme_context` sur `/api/proto/u/jb/mcp` après déploiement

## Post-implémentation

Implémentée le 2026-09-23 par Opus, review isolée (1 passe, 0 HAUTE, 5 MOYENNE corrigées).

### Écarts avec l'architecture
- Exposition de `proto` à PostgREST par migration (`20260923090100_proto_expose.sql`, `alter role authenticator set pgrst.db_schemas`) et non par l'API de gestion : le jeton `SUPABASE_ACCESS_TOKEN` de `.env.local` est refusé (401). Ce réglage en base prime sur le tableau de bord (architecture §9.3 le signale). Un `notify pgrst, 'reload schema'` a été nécessaire une fois (tables créées avant l'exposition).
- `src/types/proto-database.ts` écrit à la main au format `gen types` : `--linked` exige le jeton révoqué, `--db-url` exige Docker. Script `db:types:proto` non ajouté pour la même raison.
- Migrations poussées par `supabase db push --db-url` (la CLI liée échoue aussi sur le jeton).
- `db.ts` expose `must` / `many` / `one` génériques sur la réponse entière : l'inférence d'un `T | null` sur l'union succès / échec de supabase-js typait les lignes en `never`.
- Texte de feedback : « Ticket FB-<n> recorded. », conforme à l'AC.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| Schéma `proto` (13 tables), `proto.norm`, `proto.fr` | `supabase/migrations/20260923090000_proto.sql` | RLS sans policy, service_role seul |
| Données Acme et Delta, seed | `scripts/lib/proto-data.mjs`, `proto-seed.mjs`, `scripts/proto-seed.mjs` | Source unique, orgs jetables pour les tests |
| readEnv | `scripts/lib/env.mjs` | Lecture de `.env.local` hors Next |
| getProtoClient | `src/lib/supabase/admin.ts` | Client typé `ProtoDatabase` |
| db, result, identity, schemas | `src/proto/*.ts` | Voir component-registry |
| ctx, context, feedback, journal | `src/proto/services/*.ts` | Services S01 |
| tools, server | `src/proto/mcp/*.ts` | Adaptateur MCP, six outils par organisation |
| Route | `src/app/api/proto/u/[user]/[transport]/route.ts` | 404 JSON-RPC si inconnu, 503 si base injoignable |

### Option plus simple écartée
Un repository mémoire pour les tests, comme le banc : écarté, il aurait dupliqué en TypeScript les trigrammes, le plein texte et les cascades qu'on veut éprouver ; les tests tournent sur des orgs jetables du Supabase du banc. Écarté aussi : `registerTool` du SDK, plus court, parce que sa validation d'un champ requis rend une erreur générique au lieu de « call acme_context first ».

### Notes
- Preuves sans host couvertes par S01 : 1 (sans ctx, inconnu, d'un autre utilisateur, ctx de 100 000 caractères), 2 (version des règles), 3 (budget, rendu et `buildContext` à 1 500), 5 (context, feedback), 8 (Acme et Delta).
- Smoke HTTP local (`next start`) : `/api/mcp` du banc inchangé (smoke OK) ; `/api/proto/u/jb/mcp` sert `acme-proto` et ses six outils, context de 5 396 caractères ; `jb-delta` sert `delta_*` ; slug inconnu → 404 « Unknown user » ; journal HTTP relu en base (initialize avec `client_name`, tools/list, tools/call avec durée).
- Bug trouvé par les tests : un insert groupé du journal met à null les colonnes absentes d'une ligne, défaut compris ; `is_error` (not null) faisait tomber tout le lot. `flushJournal` pose `is_error: false` par défaut.
- ⚠️ Une commande `gen types --db-url` en échec a affiché la chaîne de connexion Postgres (mot de passe compris) dans la sortie d'outil de la session : mot de passe à faire tourner, avec les secrets déjà listés.
- Non corrigé, signalé : `bench-seed.mjs` garde sa copie du parseur de `.env.local` (edits chirurgicaux) ; `proto.norm` sans `set search_path` (appels tous qualifiés, à reprendre dans une prochaine migration).
