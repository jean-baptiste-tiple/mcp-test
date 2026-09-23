# Changelog

<!-- Ce fichier est mis à jour à chaque commit via /tm-dev.
     Format de chaque entrée :

## [Date] — [Scope]
**Quoi :** Ce qui a été fait
**Pourquoi :** La raison / la story / le bug
**Problèmes :** Ce qui a bloqué et comment c'a été résolu (si applicable)
**Écarté :** L'option d'un cran plus simple non retenue, et pourquoi (obligatoire au-delà d'un changement trivial)
**Fichiers :** Liste des fichiers créés/modifiés
-->

## [2026-09-23] — E03 : corrections des reviews S02 et S03
**Quoi :** journal plafonné à 100 messages par requête (méthodes non-chaîne ignorées), corps JSON invalide → 400 `parse_error` sans passer par mcp-handler (la requête restait pendue 60 s sans ligne de journal), refus HTTP du transport journalisés (`http_<statut>`), `sanitizeText` (NUL, surrogates isolés, troncature à frontière de code point) sur toute colonne texte du journal, `STORE_UNAVAILABLE` partagée, factory de test dérivée de `OAUTH_ORGS`, tests de tolérance d'horloge et de motifs `claims` / `error`, rewrite `/api/auth-test/mcp/.well-known/oauth-protected-resource` ; pages : lecture d'hôte unifiée (`requestHost`), middleware limité aux `GET` (les Server Actions revérifient la session elles-mêmes), tests du login déplacés en intégration avec l'erreur inline, `approve` qui gère un consentement déjà donné, `redirect` trop long ignoré au lieu de bloquer, constantes partagées (`GRANTS_PATH`, `SITE_BRAND`, `UNNAMED_CLIENT`, `clientIdSchema`), accessibilité (`aria-hidden`, `aria-busy`), bouton de déconnexion avec état d'attente, `revoke` rend `{ data }`.
**Pourquoi :** reviews isolées de S02 (2 MOYENNE, 8 BASSE) et S03 (3 MOYENNE, 14 BASSE) ; un POST anonyme de quelques Mo aurait écrit des centaines de milliers de lignes avec la clé secrète ; un middleware qui redirige un POST d'action fait tomber la page d'erreur générique quand la session a disparu (cas réel de la preuve 8).
**Problèmes :** premier agent interrompu par une limite de session en plein lot S03 ; reprise par un second agent qui a vérifié point par point (tout était déjà en place, registre complété).
**Écarté :** importer `sanitize` du banc (`src/mcp/bench/events.ts`) : lien de code avec le banc contraire à l'architecture §10, copie minimale notée comme dette ; limite de tentatives sur `/login` (limites Supabase seules, banc à deux comptes) ; boîte de confirmation sur Révoquer (l'accès se rétablit par une reconnexion) ; contraste de `--primary-dark` (token global du design system, remonté à JB).
**Fichiers :** `src/auth-test/journal.ts`, `db.ts`, `http.ts`, `token.ts`, `mcp/server.ts`, `src/lib/utils/sanitize-text.ts`, `next.config.ts`, `src/middleware.ts`, `src/lib/actions/auth.ts`, `src/lib/schemas/auth.ts`, `src/components/scope-list.tsx`, `src/app/(auth)/**` (dont `logout-button.tsx`), `tests/factories/oauth-test.factory.ts`, `tests/unit/*.test.ts`, `tests/integration/login-page.test.tsx`, `consent-page.test.tsx`, `grants-page.test.tsx`, `auth-test-server.test.ts`, `.claude/conventions/component-registry.md`

## [2026-09-23] — E03 : corrections de la review S01 et compléments S07
**Quoi :** garde du journal (`JournalEntry.token` typé résumé, `flushJournal` repasse `summarizeClaims`, `amr` filtré, logs PostgREST réduits à `{ code, message }`), test `ensureUser` (existant jamais modifié), suppression de `oauth_test.members.role` (migration `20260923141229`), nettoyage des tests robuste (`try/finally`, `allSettled`), assertions d'erreur ; S07 v2 (migration `20260923141329`) : `oauth_authorizations(email?)` et `oauth_consents(email?)` (lecture de `resource`, `scope`, `redirect_uri`, `status` des demandes des hosts), `revoke_client_grants` supprime aussi les sessions du client (parité avec `revokeGrant`), filtre des clés affiné (`token_endpoint_auth_method` visible), `user_sessions` avec `client_name`, CLI `pnpm oauth:admin authorizations | consents`.
**Pourquoi :** review isolée de S01 (5 MOYENNE) ; la preuve 9 exige de lire le paramètre `resource` que seul le serveur d'autorisation voit.
**Écarté :** garder `members.role` avec un commentaire (aucun consommateur : la surface se retire) ; `alter default privileges … revoke execute on functions from public` (sans effet, le défaut global de PostgreSQL prime ; chaque fonction porte ses `revoke`) ; un test créant un vrai client OAuth pour éprouver la suppression de ses sessions (la suppression par l'API d'administration est probablement douce, le client resterait visible pendant la campagne).
**Fichiers :** `supabase/migrations/20260923141229_oauth_test_members_drop_role.sql`, `20260923141329_oauth_test_admin_v2.sql`, `src/auth-test/journal.ts`, `db.ts`, `src/lib/supabase/admin.ts`, `src/types/oauth-test-database.ts`, `scripts/lib/oauth-admin.mjs` (+ `.d.mts`), `scripts/oauth-admin.mjs`, `tests/unit/auth-test-journal.test.ts`, `tests/integration/auth-test-helpers.ts`, `auth-test-schema.test.ts`, `auth-test-admin.test.ts`, `docs/architecture.md`, `docs/stories/E03-S01-schema-seed-journal.md`, `E03-S07-fonctions-observation-revocation.md`

## [2026-09-23] — E03-S02 et E03-S03 : serveur MCP protégé par hôte, connexion et consentement
**Quoi :** S02 : `/api/auth-test/mcp` sur deux hôtes (organisation = hôte, 404 sinon), métadonnées RFC 9728 par hôte (racine et variante suffixée, journalisées), `withMcpAuth` avec `resource_metadata` de l'hôte appelé, jeton vérifié par la JWKS du projet (`jose` : signature, `iss`, `exp`, motif au journal seulement), appartenance relue sous le jeton de l'utilisateur, `whoami` et `echo` par préfixe, journal par message JSON-RPC ; logique dans `src/auth-test/http.ts` à dépendances injectées. S03 : `/login` (starter réduit), `/oauth/consent` (`getAuthorizationDetails`, Autoriser / Refuser, `auto`, marque de l'hôte, journal `consent`), `/auth-test/grants` (`listGrants`, `revokeGrant`, déconnexion locale), middleware limité aux trois chemins avec `X-Frame-Options`.
**Pourquoi :** resource server et pages exigés par l'ADR-004 ; preuves 1 à 4 en Vitest, préparation des preuves 5 à 11.
**Écarté :** S02 : la logique dans les `route.ts` comme le proto (4 à 5 modules simulés par test, chaîne réelle jamais exercée) ; s'en remettre aux messages de `withMcpAuth` (un seul texte pour tout 401, impossible de distinguer `expired` de `signature`). S03 : journaliser la décision sans relire `getAuthorizationDetails` (rien ne relierait la ligne au client) ; `signOut` global (couperait les sessions des assistants) ; lien magique (plus lourd à piloter au navigateur).
**Dépendances :** `jose` (vérification JWKS, aucune autre voie sans `@supabase/supabase-js` en mode navigateur), `@supabase/ssr` (session par cookies des pages).
**Fichiers :**
- `src/auth-test/token.ts`, `http.ts`, `mcp/tools.ts`, `mcp/server.ts`, `orgs.ts`, `journal.ts` ; `src/app/api/auth-test/[transport]/route.ts`, `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts` ; `README.md`
- `src/lib/supabase/server.ts`, `src/lib/schemas/auth.ts`, `src/lib/actions/auth.ts`, `src/middleware.ts`, `src/components/scope-list.tsx`, `src/app/(auth)/**`
- `tests/unit/auth-test-route.test.ts`, `auth-test-metadata.test.ts`, `auth-test-tools.test.ts`, `auth-actions.test.ts`, `middleware.test.ts`, `tests/integration/auth-test-server.test.ts`, `consent-page.test.tsx`, `grants-page.test.tsx`
- `package.json`, `pnpm-lock.yaml`, `.claude/conventions/component-registry.md`, `docs/architecture.md`, `docs/stories/E03-S02-serveur-protege-par-hote.md`, `E03-S03-connexion-consentement.md`, `docs/bench/protocol.md` (§9), `docs/bench/results-oauth.md`

## [2026-09-23] — E03-S07 Fonctions d'observation et de révocation
**Quoi :** cinq fonctions `security definer` dans `oauth_test`, réservées à `service_role` (`auth_columns`, `registered_clients`, `user_sessions`, `revoke_user_sessions`, `revoke_client_grants`), CLI `pnpm oauth:admin` (columns, clients, sessions, revoke-sessions, revoke-grants avec `--yes`), `signInSession` pour les tests, tests d'intégration (droits, filtrage des secrets, sessions et révocation sur un utilisateur jetable).
**Pourquoi :** le jeton de gestion Supabase est révoqué : sans ces fonctions, la campagne ne peut ni lire les clients enregistrés par les hosts, ni voir les sessions, ni révoquer un refresh token (preuve 8).
**Problèmes :** l'`alter default privileges in schema … revoke execute` proposé en review est sans effet (défaut global de PostgreSQL) : chaque fonction porte ses `revoke` explicites, vérifiés.
**Écarté :** `supabase db query --db-url` (mot de passe du propriétaire, tout `auth` lisible) ; `auth.admin.oauth.listClients()` seul (ne rend pas la ligne brute ni `deleted_at`).
**Fichiers :**
- `supabase/migrations/20260923134030_oauth_test_admin.sql`, `src/types/oauth-test-database.ts`
- `scripts/oauth-admin.mjs`, `scripts/lib/oauth-admin.mjs` (+ `.d.mts`), `package.json`
- `tests/integration/auth-test-admin.test.ts`, `tests/integration/auth-test-helpers.ts`
- `docs/stories/E03-S07-fonctions-observation-revocation.md`

## [2026-09-23] — E03-S01 Schéma `oauth_test`, seed, scripts, journal
**Quoi :** schéma `oauth_test` (organisations avec leur hôte, membres, journal ; RLS avec policies `authenticated` sur `orgs` et `members`, aucune sur `journal` ; `service_role` seul en écriture ; exposé à PostgREST en tête de migration), types, `getOauthTestClient`, `src/auth-test/{db,orgs,journal}.ts` (`userClient(token)`, `resolveOrg`, `isMember`, `summarizeClaims`, `flushJournal`), seed (`pnpm oauth:seed` : comptes JB et alias créés s'ils manquent, Acme et Delta avec leurs hôtes, appartenances), `pnpm oauth:member`, helpers et tests d'intégration sur organisations, hôtes et utilisateurs jetables.
**Pourquoi :** socle de S02 (serveur protégé) et S03 (pages), ADR-004.
**Problèmes :** `process.exit(1)` après un appel réseau finissait en assertion libuv sous Windows (code 127) → `process.exitCode`.
**Écarté :** `summarizeClaims` sans vérification du type des claims (une valeur inattendue irait au journal, et S02 calcule `expires_in_s`). Exposition PostgREST en fin de migration (le cache aurait gardé l'ancienne liste, comme en E04-S01).
**Fichiers :**
- `supabase/migrations/20260923131211_oauth_test.sql`, `src/types/oauth-test-database.ts`
- `src/auth-test/db.ts`, `orgs.ts`, `journal.ts`, `src/lib/supabase/admin.ts`
- `scripts/lib/oauth-data.mjs` (+ `.d.mts`), `scripts/lib/oauth-seed.mjs` (+ `.d.mts`), `scripts/oauth-seed.mjs`, `scripts/oauth-member.mjs`
- `tests/unit/auth-test-journal.test.ts`, `tests/integration/auth-test-helpers.ts`, `tests/integration/auth-test-schema.test.ts`
- `package.json`, `.env.example`, `docs/stories/E03-S01-schema-seed-journal.md`

## [2026-09-23] — Cadrage E03 : authentification des assistants (OAuth 2.1 Supabase)
**Quoi :** `/tm-plan` en mode évolution sur la branche `e03-oauth` (worktree `C:\apps\mcp-test-e03`, en parallèle d'E04). Brief (section E03), PRD parcours 4.6 (FR-AUTH-01 à 12), architecture §10 (serveur auth-test : organisation par nom d'hôte, métadonnées RFC 9728 par hôte, 401, jeton vérifié par la JWKS, appartenance relue sous le jeton, journal, pages de connexion, de consentement et de clients autorisés, déploiement de préversion), ADR-004 (Supabase seul serveur d'autorisation, hypothèse à prouver ou réfuter, verdict en S06), epic E03 réécrit et six stories (schéma et seed ; serveur protégé ; connexion et consentement ; déploiement, réglages et protocole ; campagne Claude Code ; campagne web et verdict).
**Pourquoi :** la section « Connexion et identité » du doc technique de la plateforme repose sur une hypothèse jamais testée ; si elle est fausse, il faut une façade d'autorisation et l'architecture change. À prouver avant tout développement.
**Relevés du cadrage :** le serveur OAuth du Supabase du banc publie déjà `registration_endpoint`, PKCE, `offline_access`, une JWKS ES256 ; les jetons d'accès sont des JWT Supabase avec `client_id` et `aud` `authenticated` (docs) ; `redirect_uri` exacts sans joker ; le projet Vercel est en protection « Standard » (302 sur les URL de branche), sans variable en cible Preview ; le jeton de l'API de gestion Supabase est révoqué ; le push de la branche sans commit n'a déclenché aucune préversion.
**Écarté :** (1) activer `withMcpAuth` sur `/api/mcp` comme le prévoyait l'ancien E03 : le banc doit rester public (ADR-002) et la campagne E04 tourne dessus ; un troisième serveur isolé coûte trois tables et une route. (2) Construire une façade d'autorisation d'emblée : c'est l'objet du verdict, la construire d'abord rendrait la mesure inutile. (3) Une seule story de code : S02 (serveur) et S03 (pages) ne partagent aucun fichier après S01 et se parallélisent. (4) Lire l'appartenance avec la clé secrète comme le proto : le jeton sous RLS est précisément ce que le doc technique affirme ; la clé secrète ne sert qu'au journal, à la résolution de l'organisation par hôte et à la marque du consentement.
**Fichiers :**
- `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/decisions/ADR-004-auth-assistants-supabase-oauth.md`
- `docs/epics/E03-oauth-variable-de-test.md`, `docs/epics/_index.md`
- `docs/stories/E03-S01-schema-seed-journal.md` (remplace `E03-S01-oauth-supabase.md`), `E03-S02-serveur-protege-par-hote.md`, `E03-S03-connexion-consentement.md`, `E03-S04-deploiement-reglages-protocole.md`, `E03-S05-campagne-claude-code.md`, `E03-S06-campagne-web-restitution.md`
- `.claude/sprint/status.md`

## [2026-09-23] — E04-S05 Prompts suggérés, bascules de mesure, golden queries proto
**Quoi :** capacité `prompts` du serveur proto (un prompt par procédure suggérée et lisible, message = première phrase déclencheuse, journalisés) ; `pnpm proto:set` (domaines de la description de context, version des règles, ton d'un utilisateur) ; `docs/proto-golden-queries.md` ; section 8 de `docs/bench/protocol.md` (pré-requis, requêtes R1–R6 sur `proto.journal`, déroulé des sept mesures).
**Pourquoi :** mesures 2, 5, 6 et 7 du doc fonctionnel et campagnes S06-S07 rejouables.
**Écarté :** prompts en dur dans le code (le doc les porte comme contenu de l'organisation) ; bascules par SQL à la main pendant une campagne.
**Fichiers :**
- `src/proto/services/prompts.ts`, `src/proto/mcp/server.ts`, `scripts/proto-set.mjs`, `package.json`
- `tests/integration/proto-prompts.test.ts`
- `docs/proto-golden-queries.md`, `docs/bench/protocol.md`, `docs/architecture.md`, `docs/stories/E04-S05-prompts-variantes-golden.md`, `.claude/conventions/component-registry.md`, `.claude/sprint/status.md`

## [2026-09-23] — E04-S03 et E04-S04 read, write et call
**Quoi :** `read` (plan au-delà de 12 000 caractères, section par titre, changements depuis une révision, contrat d'une fonction, tableau), `write` (opérations par section, brouillon, publication, garde de révision et de brouillon, phrases de procédure, publication du guide → version des règles + 1). `call` : catalogue de 13 fonctions, arguments stricts, droits d'équipe avec refus nommant le responsable, confirmation en deux temps ; tableaux (`table.rows`, `aggregate`, `write` avec set / clear / verified_empty et null refusé, `claim`, `release`, `schema`), connecteurs simulés (sellsy, mail, slack), sondes `probe.payload` et `probe.echo`. `find` cherche aussi les fonctions. Procédures du seed réécrites dans la vraie forme de l'appel, envoi en deux temps.
**Pourquoi :** preuves 6 et 7 de l'epic E04, et tout ce que les procédures appellent.
**Problèmes :** review : brouillons concurrents qui s'écrasaient, release non gardé, clés d'arguments inconnues ignorées, procédures du seed qui contredisaient la confirmation en deux temps, cible absente du journal sur un refus ; tous corrigés et testés (claims concurrents compris).
**Écarté :** remplacer la page entière à chaque écriture (contraire aux deltas) ; un outil par famille de fonctions (contraire aux six outils figés) ; de vraies API derrière les connecteurs (aucun réseau sortant).
**Fichiers :**
- `src/proto/functions/{define,registry,simulated,table}.ts`, `src/proto/services/{call,read,write,sections,find}.ts`, `src/proto/identity.ts`, `src/proto/mcp/server.ts`
- `scripts/lib/proto-data.mjs`
- `tests/unit/proto-ops.test.ts`, `tests/integration/proto-call.test.ts`, `tests/integration/proto-read-write.test.ts`
- `docs/stories/E04-S02-routage-et-find.md`, `E04-S03-read-write.md`, `E04-S04-call-tableaux-connecteurs.md`, `.claude/conventions/component-registry.md`, `.claude/sprint/status.md`

## [2026-09-23] — E04-S02 Routage lexical et find
**Quoi :** `proto.route_candidates` (SQL : trigrammes sur phrases déclencheuses, voisines et titre, lexèmes français sans accents, vocabulaire de l'organisation) et `routing.ts` (mélange 0,55 / 0,45, atténuation des requêtes d'un mot, pénalité des voisines, bonus équipe et usage, décision seuil 0,65 + écart 0,1). `context(phrase)` sert les étapes complètes de la procédure reconnue avec les autres candidats visibles, ou les candidats et la consigne de demander, ou « no procedure matches ». `find` : trois candidats avec score, par type.
**Pourquoi :** preuve 4 de l'epic E04 (routage des intentions par le serveur, sans embedding).
**Problèmes :** le départ du doc fonctionnel (0,85 et 0,2) ne servait aucune paraphrase ; une requête d'un seul mot (« relance ») servait des étapes (lexical = 1 d'office) → migration v2 et atténuation, recalibration sur 132 phrases.
**Écarté :** le score entier en SQL (chaque réglage aurait coûté une migration) ; le seuil de départ sans calibration.
**Fichiers :**
- `supabase/migrations/20260923120000_proto_route.sql`, `20260923130000_proto_route_v2.sql`
- `src/proto/services/routing.ts`, `find.ts`, `context.ts`, `src/proto/mcp/server.ts`, `src/types/proto-database.ts`
- `tests/unit/proto-routing.test.ts`, `tests/integration/proto-routing.test.ts`, `proto-routing.cases.ts`, `proto-core.test.ts`, `proto-helpers.ts`
- `docs/architecture.md`, `docs/stories/E04-S02-routage-et-find.md`, `.claude/conventions/component-registry.md`, `.claude/sprint/status.md`

## [2026-09-23] — E04-S01 Socle du serveur proto
**Quoi :** Second serveur MCP `/api/proto/u/<utilisateur>/mcp` (identité = segment d'URL, ADR-003) : schéma `proto` (13 tables, RLS sans policy, service_role seul, exposé à PostgREST par migration), données fictives Acme Énergies (`acme_`) et Delta Logistique (`delta_`) avec seed rejouable, six outils déclarés par organisation (descriptions < 1 000, prérequis ctx en première phrase), `context` (code ctx, blocs par priorité, budget 20 000 coupé par la fin), garde ctx (absent, inconnu, autre utilisateur, règles changées), `feedback` (ticket), journal de chaque requête. find, read, write, call déclarés et refusés « not available yet » jusqu'à S02-S04.
**Pourquoi :** socle des preuves de la maquette de la plateforme MCP d'entreprise (epic E04).
**Problèmes :** jeton de l'API de gestion Supabase révoqué (exposition du schéma par `alter role authenticator`, types écrits à la main, `db push --db-url`) ; insert groupé du journal qui tombait sur `is_error` null (défaut posé). Une commande en échec a affiché la chaîne de connexion Postgres dans la session : mot de passe à faire tourner.
**Écarté :** repository mémoire pour les tests (dupliquerait le SQL à éprouver) ; `registerTool` (erreur générique au lieu de « call acme_context first »). Le modèle de données entier dans une migration, colonnes de S02-S04 comprises, est un arbitrage de cadrage assumé (en-tête de la migration).
**Fichiers :**
- `supabase/migrations/20260923090000_proto.sql`, `20260923090100_proto_expose.sql`
- `scripts/proto-seed.mjs`, `scripts/lib/proto-data.mjs` (+ `.d.mts`), `scripts/lib/proto-seed.mjs` (+ `.d.mts`), `scripts/lib/env.mjs` (+ `.d.mts`)
- `src/types/proto-database.ts`, `src/lib/supabase/admin.ts`
- `src/proto/db.ts`, `result.ts`, `identity.ts`, `schemas.ts`, `services/{ctx,context,feedback,journal}.ts`, `mcp/{tools,server}.ts`
- `src/app/api/proto/u/[user]/[transport]/route.ts`
- `tests/unit/proto-tools.test.ts`, `tests/unit/proto-route.test.ts`, `tests/integration/proto-core.test.ts`, `tests/integration/proto-helpers.ts`
- `package.json`, `README.md`, `docs/architecture.md`, `docs/decisions/ADR-003-identite-test-proto.md`, `docs/stories/E04-S01-socle-proto.md`, `.claude/conventions/component-registry.md`, `.claude/sprint/status.md`

## [2026-09-23] — Cadrage E04 : maquette de la plateforme MCP d'entreprise
**Quoi :** `/tm-plan` en mode évolution. Brief (section E04), PRD parcours 4.5 (FR-PROTO-01 à 17), architecture §9 (serveur proto : route par utilisateur, schéma `proto` de 13 tables, contrat des six outils, routage, droits, tests), ADR-003 (identité de test par segment d'URL), epic E04 et sept stories. Deux clients fictifs, Acme (`acme_`) et Delta (`delta_`), branchés ensemble dans chaque host pour vérifier les noms d'outils par client.
**Pourquoi :** prouver le contrat des docs d'architecture fonctionnelle et technique, et chiffrer leurs sept mesures ouvertes, avant de construire la plateforme.
**Écarté :** un repository mémoire pour les tests (comme le banc) : il aurait dupliqué en TypeScript le plein texte et les trigrammes qu'on veut éprouver ; les preuves tournent contre le Supabase du banc sur des organisations jetables. Et OAuth (E03) pour l'identité : aucune preuve ni mesure n'en dépend.
**Fichiers :**
- `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/decisions/ADR-003-identite-test-proto.md`
- `docs/epics/E04-maquette-plateforme.md`, `docs/epics/_index.md`
- `docs/stories/E04-S01` à `E04-S07`
- `.claude/sprint/status.md`

## [2026-09-22] — E01-S05 Restitution dans les conventions + fin de campagne
**Quoi :** Fin de la campagne, pilotée automatiquement (Claude Code en `claude -p` ; claude.ai et ChatGPT par navigateur Playwright) : grille C sur les trois hosts (descriptions et instructions longues, noms, nombre de tools, schéma profond, identité) ; grille D complétée (témoin et `name_first` sur claude.ai, Sonnet 5 / Fable 5.1 / Haiku 4.5 sur claude.ai, « Analyser » sur ChatGPT, Sonnet et Fable sur Claude Code) ; contrôle du canal lu par le modèle (P16) ; rapports de frictions P15 ; clôture (`baseline`, seed). Restitution E01-S05 : `mcp-patterns.md` §2.1, §2.4 (nouveau, readme + ack), §3, §4, §4 bis, §7, §8 (grille des gestes de rafraîchissement), §10 ; `CLAUDE.md` règles MCP 6 et 7 ; template golden queries ; starter MCP. Runbook et protocole : pièges de pilotage et prompt P16.
**Pourquoi :** Remplacer par des mesures datées les affirmations non mesurées des conventions (story E01-S05). Faits majeurs : Claude Code ne montre que `structuredContent` quand il existe (claude.ai et ChatGPT le texte) ; claude.ai ne montre jamais les instructions et fige parfois une conversation sur un instantané local des tools ; Claude Code coupe descriptions et instructions à 2 048 caractères et casse une session sur un nom de 128 ; le levier `ack` fait lire le readme sur les 3 hosts et les 9 couples host × modèle testés.
**Problèmes :** Mesures claude.ai de 15:08 à 15:31 faussées par l'instantané local des tools (premier message envoyé une seconde après le chargement) : diagnostiqué dans le localStorage, documenté en friction, mesures rejouées avec 12 s d'attente. Une reconnexion du connecteur claude.ai (test du geste) a vidé l'instantané : plus aucun tool dans les premiers messages, revenu avec l'attente.
**Écarté :** (1) Finir Claude Desktop : écarté par JB, le chat Desktop partage le client de claude.ai. (2) Un fichier `.patch` versionné pour le dépôt template : redondant avec le commit, la commande ci-dessous produit le diff. (3) Corriger ici les commentaires de `src/mcp/tool-result.ts` et `src/mcp/bench/handlers/readme.ts` (ancien contrat « texte seul ») : code, hors story documentaire.
**Report dans `tiple-method-template` :** `.claude/conventions/mcp-patterns.md`, `CLAUDE.md` (règles MCP 6 et 7 seulement), `.claude/templates/mcp-golden-queries.tmpl.md`, `.claude/starters/mcp/README.md`, `.claude/starters/mcp/tool-result.ts`. Diff prêt : `git diff beafbd9 HEAD -- .claude/conventions/mcp-patterns.md CLAUDE.md .claude/templates/mcp-golden-queries.tmpl.md .claude/starters/mcp/README.md .claude/starters/mcp/tool-result.ts`
**Fichiers :** docs/bench/results.md, docs/bench/campagne.md, docs/bench/protocol.md, docs/stories/E01-S05-restitution-conventions.md, docs/epics/E01-banc-mcp-stateless.md, .claude/sprint/status.md, .claude/conventions/mcp-patterns.md, CLAUDE.md, .claude/templates/mcp-golden-queries.tmpl.md, .claude/starters/mcp/README.md, .claude/starters/mcp/tool-result.ts, docs/changelog.md

## [2026-09-22] — Banc : grille D (leviers readme) sur claude.ai et ChatGPT
**Quoi :** Bloc 4 de la campagne joué sur claude.ai (Opus 5) et ChatGPT via le navigateur Playwright : leviers `ack`, `instructions`, `descriptions`, `hub`, `gate` et témoin `baseline` (P12/P13/P14 + journal serveur). Grille D et table P14 remplies, six frictions P15 ajoutées, empreintes des hosts précisées (pools d'IP rotatifs, `server/discover`, double `initialize` ChatGPT), table des conclusions E01-S05 renseignée. `.playwright-mcp/` (sorties Playwright) ignoré par git.
**Pourquoi :** Savoir quel levier force la lecture d'un readme sur chaque host : `ack` et `descriptions` partout ; `instructions` et `hub` inopérants sur claude.ai ; `gate` inutilisable derrière les passerelles à IP rotatives ; Claude Code seul à masquer le `content` texte derrière `structuredContent` ; auto-déclarations ChatGPT non fiables.
**Écarté :** Rejouer chaque levier sur plusieurs modèles claude.ai/ChatGPT et Claude Desktop (bloc 5, Desktop écarté par l'utilisateur) : le levier retenu (`ack`) est déjà identique sur les trois hosts et trois modèles Claude, le gain attendu ne vaut pas le temps de campagne.
**Fichiers :** docs/bench/results.md, .gitignore, docs/changelog.md

## [2026-09-22] — E01-S03 Sondes whoami, mutate, readme et leviers readme
**Quoi :** Sondes `bench_whoami` (scénario, version, en-têtes, tools `name@version`, hashes, `note` optionnel pour tagger host/modèle), `bench_mutate` (Zod `BenchMutateInput` : create/update/enable/disable tool, set_instructions, bump_version sur le scénario actif ; `updated_at` posé par les updates ; `notifications/tools/list_changed` émise dans le flux de réponse de sa propre requête via `relatedRequestId`, seule voie stateless), `bench_readme` (contenu + ack HMAC-SHA256 fenêtré) ; six leviers readme appliqués par `applyLever` (fonction pure) ; gardes `ack` et `gate` avant dispatch ; contexte par requête avec outcomes (`list_changed_sent`, `is_error`, `error_text` fusionnés dans le journal) ; GET/DELETE journalisés `http:GET`/`http:DELETE` puis 405 sans charger le snapshot ; migration d'amorçage des sondes ; smoke étendu (whoami, mutate create puis disable, notification dans le flux).
**Pourquoi :** Story E01-S03 : rendre le banc pilotable depuis la conversation et mesurer si un readme peut être imposé.
**Problèmes :** `sendToolListChanged()` nu sort `true` en stateless alors que le SDK abandonne la notification en silence : remplacé par une notification attachée à la requête (`relatedRequestId`). mcp-handler résout la `Response` dès les en-têtes : fusion des outcomes déplacée dans `after()`. Cycle d'imports `registry → handlers → levers → registry` : `toToolList` déplacé dans `levers.ts` (puis dépublié), `context.ts` créé. Review : `note` borné à 200 caractères, le levier `ack` ne répare plus un schéma volontairement malformé, garde ack testée (expiré vs faux), `MemoryBenchRepository` extraite, secret manquant en prod converti en erreur de tool visible dans le journal, `isRecord` factorisé, en-tête de la migration corrigé (amorçage, source unique `probes.mjs`).
**Écarté :** Garde ack/gate posée dans `server.ts` sans outcomes (le journal aurait dû relire le résultat dans la réponse HTTP, impossible en batch ; trois colonnes de S02 restaient mortes) ; outcome stocké sur le snapshot (écrasé par un batch de deux appels) ; trigger `updated_at` en base (les updates du repository le posent, une seule écriture).
**Fichiers :** `src/mcp/bench/{ack,levers,context}.ts`, `src/mcp/bench/handlers/{whoami,mutate,readme}.ts`, `src/lib/schemas/bench-mutate.ts`, `src/mcp/bench/{registry,repository,events}.ts`, `src/mcp/server.ts`, `src/app/api/[transport]/route.ts`, `supabase/migrations/20260922092059_probes.sql`, `scripts/smoke-mcp.mjs`, `.env.example`, `tests/factories/bench.factory.ts`, `tests/unit/{bench-ack,bench-levers,bench-handlers,bench-registry,bench-events,mcp-server}.test.ts`, `docs/stories/E01-S03-*.md`, `docs/decisions/ADR-001-transport-stateless.md`, `docs/prd.md`, `docs/architecture.md`, `docs/bench/protocol.md`

## [2026-09-22] — E01-S04 Catalogue de scénarios, seed, protocole, golden queries
**Quoi :** `scripts/lib/probes.mjs` (source unique des 4 sondes et du scénario `baseline`), `scripts/lib/catalogue.mjs` (27 scénarios déterministes : longueurs de descriptions, noms, instructions ; nombre de tools 20 à 500 ; identité serveur ; formes de schéma ; 6 leviers readme ; canaris `[C:slug:field:pos:hex]` aux tiers, descriptions au format mcp-patterns §3), `scripts/bench-seed.mjs` (`pnpm bench:seed` : lecture manuelle de `.env.local`, upsert idempotent par diff, sondes clonées depuis `probes.mjs`, orphelins supprimés par scénario, restaure `baseline`, jamais `is_active`), 43 tests. Docs : `docs/bench/protocol.md` (prompts P0 à P15, échelle L0 à L5, requêtes Q1 à Q8, dimension host × modèle), `docs/bench/results.md`, `docs/mcp-golden-queries.md`.
**Pourquoi :** Story E01-S04 : les scénarios sont des données ; le protocole rend la campagne reproductible host par host et modèle par modèle.
**Problèmes :** Review HAUTE : la première version clonait les sondes depuis les lignes vivantes de `baseline`, que la grille B mute par conception, et ne restaurait pas `baseline` : remplacée par la source unique `probes.mjs` et un seed qui traite `baseline` comme les autres scénarios. TypeScript mappe un import `.mjs` sur `.d.mts`, pas `.d.ts`.
**Écarté :** Readme généré par concaténation simple (canari `start` à 31 %, hors du premier tiers à une phrase près) ; pas de fichier de déclaration (`input_schema` en `any` dans les tests) ; garder la migration comme source des sondes (impossible à rejouer sur une base mutée) ; liste de slugs maintenue à la main (`SCENARIO_SLUGS`, retirée).
**Fichiers :** `scripts/lib/{probes,catalogue}.mjs`, `scripts/lib/catalogue.d.mts`, `scripts/bench-seed.mjs`, `tests/unit/bench-catalogue.test.ts`, `package.json`, `README.md`, `docs/bench/{protocol,results}.md`, `docs/mcp-golden-queries.md`, `docs/stories/E01-S04-*.md`, `.claude/conventions/component-registry.md`, `docs/architecture.md`

## [2026-09-22] — E01-S02 Registre de tools en base et journal des requêtes
**Quoi :** Migration `bench_scenarios` / `bench_tools` / `bench_events` (RLS activé sans policy, index, contraintes, seed `baseline` + `bench_echo`) appliquée sur le projet Supabase ; `/api/mcp` construit un handler mcp-handler **par requête** depuis un snapshot lu en base (aucun cache), handlers bas niveau `tools/list` (JSON Schema brut des lignes) et `tools/call` (dispatch par `handler`, echo plafonné 64 ko, erreurs actionnables), `capabilities.tools.listChanged` déclaré ; journal de chaque requête JSON-RPC (objet ou batch) via `after()` : clientInfo, protocole, user-agent, IP, tool, args tronqués 8 ko, `tools_served`, `response_chars` ; `BenchRepository` (Supabase injecté, mémoire pour les tests) ; chaîne démo `get_status` retirée ; smoke appelle `bench_echo`. 29 tests.
**Pourquoi :** Story E01-S02 : cœur du banc, les tools sont des lignes modifiables sans redéploiement et chaque lecture par un host laisse une trace datée.
**Problèmes :** `server-only` jette à l'import hors serveur : le client Supabase est injecté dans le repository depuis la route, pas importé. mcp-handler consomme le body : clone avant l'appel. Review : batch JSON-RPC sans plafond dans le journal (→ 100 événements par requête), snapshot vide partagé mutable (→ fabrique), `\u0000` et surrogates isolés dans les valeurs du body (Postgres les refuse en `text`/`jsonb`, tout le batch du journal serait perdu → remplacés par `�` au point de passage unique) corrigés.
**Écarté :** Journaliser dans le callback d'init de mcp-handler (sans clone ni parse) : ne voit ni body, ni batch, ni `rpc_id`, donc ni `tools_served` ni `args`. Migration réduite aux colonnes lues par S02 puis `alter table` en S03 : un modèle défini d'un bloc, S03/S04 Ready dans le même sprint. Repli silencieux sur un snapshot vide en cas de panne DB : mesures fausses.
**Fichiers :** `supabase/migrations/20260922082138_bench.sql`, `src/mcp/bench/{repository,snapshot,registry,events}.ts`, `src/mcp/bench/handlers/echo.ts`, `src/lib/utils/byte-size.ts`, `src/app/api/[transport]/route.ts`, `src/mcp/{server,config}.ts`, `src/types/database.ts`, `scripts/smoke-mcp.mjs`, `tests/factories/bench.factory.ts`, `tests/unit/{bench-registry,bench-events,byte-size,mcp-server}.test.ts`, `README.md`, suppression `src/mcp/tools/get-status.ts`, `src/lib/schemas/status.ts`, `src/lib/services/status-service.ts` ; `docs/stories/E01-S02-registre-et-journal.md`, `docs/stories/E01-S03-*.md`, `docs/stories/E01-S04-*.md` (coordination S03/S04), `.claude/conventions/component-registry.md`, `.claude/sprint/status.md`

## [2026-09-22] — E01-S01 Setup technique : starter MCP stateless sans widgets, Supabase, migrations
**Quoi :** Endpoint `/api/mcp` (mcp-handler 1.1.0 + SDK 1.26.0, stateless, `disableSse`) avec la chaîne démo `get_status` du starter, `serverInfo` `mcp-bench` / `MCP Bench` ; client Supabase clé secrète `getAdminClient` (`server-only`, typé `Database`) ; CLI Supabase branchée (`db:push`, `db:types --linked`, `config.toml` réduit à `project_id`) ; `type-check` = `next typegen && tsc --noEmit` ; smoke HTTP `scripts/smoke-mcp.mjs` (échoue sur `isError`) ; test unit `InMemoryTransport` ; README section MCP Bench ; `.vscode/` et `supabase/.temp/` ignorés ; `.env.example` réduit aux variables lues.
**Pourquoi :** Story E01-S01, socle du banc MCP (voir entrée cadrage ci-dessous).
**Problèmes :** `pnpm add mcp-handler` installe 2.2.0 dont le peer est le SDK v2 scindé (`@modelcontextprotocol/server`), incompatible avec le starter : épinglé 1.1.0 / 1.26.0. Première review : 8 MOYENNE (surfaces mortes `MCP_RESOURCE_URL`, `SITE_URL`, `capabilities: {tools: {}}`, `config.toml` de stack locale, variables d'env non lues, `.vscode/` non ignoré, `admin.ts` non typé, registry) corrigées, seconde review au vert.
**Écarté :** Route nue sans tool démo (smoke limité à `initialize`) : `tools/list` et `tools/call` n'auraient pas été vérifiés de bout en bout ; la chaîne démo coûte 4 fichiers supprimés en S02. Aussi écarté : `onlyBuiltDependencies` pour la CLI Supabase (plus de postinstall en 2.117) et un workflow CI de migrations (rien ne casse sans lui, `db:push` local).
**Fichiers :** `src/app/api/[transport]/route.ts`, `src/mcp/{config,server,tool-result}.ts`, `src/mcp/tools/get-status.ts`, `src/lib/schemas/status.ts`, `src/lib/services/status-service.ts`, `src/lib/supabase/admin.ts`, `src/types/database.ts`, `scripts/smoke-mcp.mjs`, `tests/unit/mcp-server.test.ts`, `supabase/config.toml`, `supabase/migrations/.gitkeep`, `package.json`, `pnpm-lock.yaml`, `.env.example`, `.gitignore`, `README.md`, `next-env.d.ts`, `.claude/conventions/{tech-stack,component-registry}.md`, `docs/stories/E01-S01-setup-technique.md`, `.claude/sprint/status.md`

## [2026-09-22] — Cadrage MCP Bench (/tm-plan initial)
**Quoi :** Brief, PRD (4 parcours : piloter, observer, faire lire le readme, restituer ; 19 FR), architecture (serveur piloté par 3 tables Supabase `bench_scenarios` / `bench_tools` / `bench_events`, handler créé par requête depuis un snapshot, 4 sondes whoami/echo/mutate/readme, 6 leviers readme, ack HMAC fenêtré), ADR-001 (transport stateless, stateful conditionnel en E02), ADR-002 (dérogations banc : serveur public, tools en base, clé secrète serveur, pas de widgets), epics E01 (Ready) / E02 / E03 (Draft), 7 stories, sprint initialisé. Livrables docs de S04 rédigés d'avance : `docs/bench/protocol.md` (prompts P0 à P15, échelle L0 à L5, requêtes Q1 à Q7), `docs/bench/results.md` (grilles A à D), `docs/mcp-golden-queries.md`.
**Pourquoi :** Les conventions MCP (mcp-patterns §2.1, §3, §7, §8, §10) affirment des comportements de hosts sans mesure ; le banc mesure, host par host, quand les métadonnées sont lues, l'action minimale pour voir une mise à jour, les seuils de troncature et le levier qui force la lecture d'un readme, puis corrige les conventions (E01-S05).
**Écarté :** Interface d'administration web (Supabase Studio suffit) ; tools statiques dans le code avec redéploiement (une itération coûterait un build et confondrait cache host et déploiement) ; OAuth dès la phase 1 (plus gros chantier UI, sans lien avec les premières mesures).
**Fichiers :** `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/decisions/ADR-001-transport-stateless.md`, `docs/decisions/ADR-002-derogations-banc.md`, `docs/epics/{_index,E01-banc-mcp-stateless,E02-push-list-changed,E03-oauth-variable-de-test}.md`, `docs/stories/E01-S01..S05`, `docs/stories/E02-S01`, `docs/stories/E03-S01`, `docs/bench/{protocol,results}.md`, `docs/mcp-golden-queries.md`, `.claude/sprint/status.md`

## [2026-08-26] — Règle « trace de l’arbitrage », Fable pilote / Opus écrit, .tiple → .claude
**Quoi :** (1) Règle anti-over-engineering rendue observable : toute surface nouvelle porte ce qui casse sans elle aujourd’hui (sinon retrait), et au-delà d’un changement trivial l’entrée changelog nomme l’option plus simple écartée (champ `**Écarté :**`). Texte canonique dans coding-standards §Surfaces nouvelles, relayé par CLAUDE.md, contrôlé par la checklist code-review et l’agent /tm-review ([MOYENNE]). (2) Section « Qui exécute : Fable pilote, Opus écrit » dans CLAUDE.md. (3) /tm-wrap-up écrit directement dans conventions/ADR/CLAUDE.md — plus de validation préalable. (4) `.tiple/` fusionné dans `.claude/` (checklists, conventions, sprint, starters, templates), toutes les références de chemin réécrites.
**Pourquoi :** Sous sa forme littérale (« rester simple ») la règle ne se contrôle pas sur un diff ; ce qui se contrôle est la trace de l’arbitrage. Un seul dossier de méthode au lieu de deux.
**Écarté :** Créer un template de PR / CONTRIBUTING.md pour porter le contrôle — écarté : ils n’existent pas ici, la CI ne fait que `pnpm build`, et le contrôle de review vit déjà dans l’agent /tm-review ; créer ces fichiers serait exactement la surface injustifiée que la règle interdit.
**Fichiers :** `CLAUDE.md`, `.claude/conventions/coding-standards.md`, `.claude/checklists/code-review.md`, `.claude/commands/{tm-review,tm-dev,commit-push,tm-wrap-up}.md`, `.claude/skills/tm-wrap-up/SKILL.md`, `.claude/templates/story.tmpl.md`, `docs/changelog.md`, déplacement `.tiple/**` → `.claude/**` + réécriture des chemins (README, docs/, files/, skills)

## [2026-07-20] — Design system v2 (backport cv-editor) : sidebar sombre, pattern croix + halo, fond #FAFAFA, inputs pill
**Quoi :** Port des 7 commits design de mcp-cv-editor (`d468a52` → `0052248`) :
- **Fond de page `#FAFAFA`** (light) avec surfaces de contenu OPAQUES en blanc (`bg-card` sur Input/Select/Textarea/EmptyState/DataTable).
- **Pattern graphique de page** : utilitaires `.page-canvas` (halo mint haut-droite + écho bas-gauche, variantes dark) et `.page-canvas::before` (semis de croix « repères d'ingénierie » SOUS le contenu — `isolation: isolate` + `z-index: -1`, masque radial à estompe longue), couplés au grain `.noise-overlay`. Appliqués au `<main>` du layout dashboard et au layout auth du starter supabase.
- **Sidebar SOMBRE dans les deux thèmes** (tokens `--sidebar*` light passés en quasi-noir chaud) : layout `(dashboard)` refondu — aside sticky avec AppLogo + `SidebarNav` (nouveau composant générique, item actif en pill mint pleine, items dans `nav-items.ts` à personnaliser), barre mobile sombre, sans séparateurs internes.
- **Inputs & selects en pill** (`rounded-full`, fond `bg-card`) ; textarea radius net fond blanc.
- **H2 éditorial** : tiret vertical mint + titre bold (encodé dans `section.tsx` de la preview + snippet dans system.md).
- Docs synchronisées : `docs/design/system.md` (tokens, section « Fond des corps de page », patterns), registry (SidebarNav, notes pill), CLAUDE.md + README (thème).
**Pourquoi :** JB a fait évoluer l'identité sur cv-editor (branding éditorial complet) — le template repart avec ce niveau de finition par défaut.
**Fichiers :** `src/app/globals.css`, `src/app/(dashboard)/layout.tsx`, `src/components/{sidebar-nav.tsx,nav-items.ts}` (nouveaux), `src/components/{empty-state,data-table}.tsx`, `src/components/ui/{input,select,textarea}.tsx`, `src/app/design-system/sections/section.tsx`, `.claude/starters/supabase-auth/auth-layout.tsx`, `docs/design/system.md`, `.claude/conventions/component-registry.md`, `CLAUDE.md`, `README.md`

## [2026-07-19] — Rapports agents cv-editor (2ᵉ vague) : content texte roi, même-tour, loader jamais terminal, tous les canaux
**Quoi :** Backport des correctifs issus des rapports de frictions agents (Claude + ChatGPT) sur mcp-cv-editor (commits `4a8361d`, `9f279c1`) :
- **Contrat §4 corrigé (leçon n°1)** : le `content` TEXTE est la seule voie fiable vers le modèle — certains hosts masquent `structuredContent` (canal du widget). Consignes + données d'un prepare vont dans le texte (cap de taille), dupliquées dans structuredContent pour le widget. `tool-result.ts` du starter documenté en conséquence.
- **§4 bis enrichi** : enchaînement prepare→save MÊME TOUR (consigne explicite obligatoire), ingestion FIDÈLE par défaut (optimisation = 2ᵉ étape explicite), audits dont les invariants s'adaptent à l'intention (`kind` : même langue = contrôles par contenu ; traduction = contrôles structurels + invariants indépendants de la langue), rejets = chaîne fautive + pourquoi + comment corriger.
- **Bridge starter** : écoute du CustomEvent `openai:set_globals` (ChatGPT livre les updates par LÀ, pas par postMessage → loader infini sinon) ; nouveau `widgets/shared/mount.tsx` (hook `useToolOutput` avec subscription + polling filet 400 ms × 30 + `mount()`) ; widget démo réécrit dessus avec **timeout 12 s → erreur actionnable** (le loader n'est jamais un état terminal, 4 états obligatoires). Corrige au passage l'import obsolète `initBridge` du widget démo.
- **Instructions serveur (starter + §2.1)** : ne jamais affirmer que le widget a affiché quelque chose (fallback si aperçu bloqué, pas de retry identique) ; liens signés toujours en markdown court + expiration ; règle même-tour.
- **Boucle de feedback agent institutionnalisée (§8 + CLAUDE.md règle 6 + template golden queries)** : rapport de frictions structuré demandé à l'agent hôte sur les DEUX hosts après chaque évolution, section dédiée dans le template golden-queries, rappel que les hosts cachent les métadonnées (déconnecter/reconnecter avant de tester).
**Pourquoi :** deux rapports d'agents ont trouvé en un test ce que les reviews de code n'avaient pas vu — ces règles évitent de repayer les mêmes frictions sur le prochain produit.
**Fichiers :** `.claude/conventions/mcp-patterns.md`, `.claude/starters/mcp/{widgets-bridge.ts,widgets-mount.tsx (nouveau),widget-status-card-main.tsx,tool-result.ts,server.ts,README.md}`, `.claude/templates/mcp-golden-queries.tmpl.md`, `CLAUDE.md`, `docs/changelog.md`

## [2026-07-19] — Fusion branche `template-mcp-learnings` (apprentissages docs MCP CV Editor)
**Quoi :** Fusion sur main de la branche d'apprentissages doc : `mcp-patterns.md` §4 bis « zéro IA serveur » enrichi (garde-fous re-dérivés serveur, audits Unicode/accents, anti-invention par invariants, parité web/MCP), nouveau §4 ter « éditions en deltas » (ops par nom, lecture partielle, économie de tokens), §3 durci (annotations honnêtes, résolution par nom accents/ilike, tools destructifs jamais dans next_actions), §5.3 (URLs absolues widgets, deep links vs route groups, a11y), §5.3 bis (appariement widget↔tool), §6 bis (SSRF, uploads signés, middleware, RGPD, ilike/secrets) ; règles MCP 6-9 du CLAUDE.md ; nouvelle commande `/tm-audit` (revue totale Code × UI/UX × AX) ; checklist code-review, coding-standards, security-patterns et skill `mcp` enrichis. Conflits résolus en combinant avec le backport du jour (transport stateless/stateful conservé, triple méta conservée, §4 bis fusionné vers la version la plus riche).
**Pourquoi :** deux sessions avaient capturé les apprentissages cv-editor en parallèle (code+design d'un côté, doctrine/review de l'autre) — main porte maintenant les deux.
**Fichiers :** `.claude/conventions/{mcp-patterns,coding-standards,security-patterns}.md`, `.claude/checklists/code-review.md`, `.claude/commands/tm-audit.md` (nouveau), `.claude/skills/mcp/SKILL.md`, `CLAUDE.md`, `README.md` (table commandes), `docs/changelog.md`

## [2026-07-19] — Backport mcp-cv-editor : design system Tiple mint + fixes MCP Apps prod + transport au choix
**Quoi :**
- **Design system Tiple (vert mint)** porté depuis mcp-cv-editor : tokens complets (neutres chauds oklch 80, `--primary-dark` texte-accent AA, radius 0.25rem, dark quasi-noir), fonts Instrument Sans + JetBrains Mono, icônes Phosphor (app) — lucide reste pour les internes Shadcn, boutons/badges pilule, utilitaires éditoriaux (`hover-lift`, `text-stroke`, `noise-overlay`), curseur pointer sur interactifs. Composants mis à jour (button, badge, radio-group, spinner, stat-card, theme-toggle) + nouveaux : CopyButton, AppLogo, favicon `icon.svg`, `loading.tsx` global. Page `/design-system` refondue en sections modulaires. `tailwind.config.ts` SUPPRIMÉ : `globals.css` = source unique (Tailwind v4 CSS-first — `@custom-variant dark`, `@plugin "tailwindcss-animate"`, keyframes accordion dans `@theme`) ; corrige au passage le warning ESM du build. `components.json` : config tailwind vide (v4).
- **Starter MCP réécrit sur le code prod de mcp-cv-editor** (fixes dual-host payés en debug réel) : triple méta widget (`ui.resourceUri` GA nested + alias plat pré-GA + `openai/outputTemplate` → variante skybridge), mimeTypes profilés (`text/html;profile=mcp-app` sinon Claude rejette ; `text/html+skybridge` pour ChatGPT) avec 2 resources par bundle, bridge réécrit sur le SDK officiel `@modelcontextprotocol/ext-apps` (`app-with-deps` ; pièges appInfo/initialized documentés), bundles inlinés dans `src/mcp/widgets/generated.ts` par `widgets/build.mjs` (zéro fs runtime, zéro tracing Vercel), route déplacée en `src/app/api/[transport]` (404 avec token valide sinon), `config.ts` + `tool-meta.ts` (securitySchemes), auth JWKS alignée sur la prod, RFC 9728 via `generateProtectedResourceMetadata` + rewrites variantes, `widgets/tsconfig.json` dédié + exclude racine, smoke test HTTP `scripts/smoke-mcp.mjs`, test unit triple-méta/2-resources (placeholder buildable inclus).
- **Transport au choix stateless/stateful** (demande JB) : stateless reste le défaut ; bloc stateful (Redis `redisUrl` + SSE/sessions) prêt en commentaire dans la route, critères de choix + conséquences dans `mcp-patterns.md` §7, `REDIS_URL` dans `.env.example` — décision figée par ADR au cadrage.
- **Conventions enrichies** (retours de prod) : `mcp-patterns.md` §5.1/5.2/5.3/5.4 réécrits (metas GA, SDK ext-apps, budgets bundle réels ~527 Ko, bundles inlinés), nouveau §4 bis « prepare → modèle de l'host → save » (généralisé, optionnel), §10 smoke scripté ; `tech-stack.md` : lignes ext-apps/GA + versions de référence connues-bonnes (sdk 1.26.0, mcp-handler 1.1.0, ext-apps 1.7.4).

**Pourquoi :** rapatrier dans le template tout ce que mcp-cv-editor a appris en allant en prod (design Tiple + debugging MCP Apps sur Claude ET ChatGPT), pour que le prochain produit démarre avec ces pièges déjà payés.

**Fichiers :** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/icon.svg`, `src/app/design-system/**`, `src/components/{ui/button,ui/badge,ui/radio-group,ui/spinner,stat-card,theme-toggle,copy-button,logo}.tsx`, `src/app/(dashboard)/dashboard/page.tsx`, `tailwind.config.ts` (supprimé), `components.json`, `tsconfig.json`, `package.json` (+@phosphor-icons/react), `.env.example`, `.claude/starters/mcp/**` (réécrit, +7 fichiers), `.claude/conventions/{mcp-patterns,tech-stack,component-registry}.md`, `docs/design/system.md`, `CLAUDE.md`, `README.md`, `.claude/commands/tm-plan.md`, `files/guide-mise-a-jour-framework.md`

## [2026-07-17] — Starter Canal MCP + tests smoke + error.tsx + hook durci
**Quoi :**
- Nouveau starter `.claude/starters/mcp/` (15 fichiers) : endpoint `/api/mcp` stateless (mcp-handler), chaîne démo complète `schema Zod partagé → service → tool get_status`, helpers `widget-meta` (dual-meta `ui/resourceUri` + `openai/outputTemplate`) et `tool-result` (deux formes + erreurs actionnables), `auth.ts` OAuth 2.1 (JWKS Supabase, à activer avec supabase-auth), route RFC 9728, bridge widgets unique deux dialectes, widget exemple `status-card` (états + thème) buildé par Vite single-file, test unit `InMemoryTransport`. Chaque fichier référence la section de `mcp-patterns.md` qu'il implémente, avec `TODO(S01)` sur les points à valider contre les versions épinglées.
- Tests smoke ajoutés : `tests/e2e/smoke.spec.ts` (redirect home → /dashboard + design system, valide la config Playwright) et `tests/integration/dashboard-page.test.tsx` (RTL + jsdom + jest-dom). `tests/setup.ts` existait mais n'était pas branché — `setupFiles` câblé dans `vitest.config.ts`.
- `src/app/error.tsx` global ajouté (EmptyState + Button, reset).
- Hook `enforce-bash-rules.sh` durci : l'extraction de `tool_input.command` gérait mal les guillemets échappés (une commande avec `"…"` tronquait l'extraction au premier `\"` → un pipe interdit passait). Extraction via jq, fallback perl, dernier recours historique. Vérifié sur 3 cas (pipe caché par guillemets bloqué, commande propre OK, pipe dans `description` seule OK).
- `commit-push.md` : trailer co-author neutre (plus de modèle hardcodé).
- Docs synchronisées : README (table starters, structure, checks), CLAUDE.md (starter MCP), tech-stack.md (jose, vite-plugin-singlefile), mcp-patterns.md (pointeur starter).

**Pourquoi :** suite de l'audit boilerplate — le cœur MCP du template ("mcp-template") était entièrement "à créer en S01" à chaque projet. Le starter fait gagner la story de setup et fixe les patterns par l'exemple.

**Fichiers :**
- `.claude/starters/mcp/` (15 nouveaux fichiers)
- `tests/e2e/smoke.spec.ts`, `tests/integration/dashboard-page.test.tsx`, `vitest.config.ts`
- `src/app/error.tsx`
- `.claude/hooks/enforce-bash-rules.sh`, `.claude/commands/commit-push.md`
- `README.md`, `CLAUDE.md`, `.claude/conventions/tech-stack.md`, `.claude/conventions/mcp-patterns.md`

## [2026-07-17] — Audit boilerplate : 3 fixes (route `/` 404, config Tailwind morte, lint du build output)
**Quoi :**
- Route `/dashboard` créée : `src/app/(dashboard)/page.tsx` → `src/app/(dashboard)/dashboard/page.tsx`. Avant, cette page résolvait vers `/` (un route group ne crée pas de segment d'URL), était silencieusement masquée par `src/app/page.tsx`, et le `redirect("/dashboard")` de la home aboutissait à un 404 out of the box.
- `@config "../../tailwind.config.ts"` ajouté dans `globals.css`. Tailwind v4 ne lit aucun fichier config sans cette directive : `darkMode: "class"` était inactif (les `dark:` du ThemeToggle et d'Alert suivaient l'OS au lieu de la classe next-themes), le plugin `tailwindcss-animate` n'était pas chargé (animations des 8 composants overlay = no-op) et les keyframes accordion absents. Vérifié dans le CSS buildé : `@keyframes enter`, `@keyframes accordion-*`, `:is(.dark …)` présents.
- `ignores` (`.next/`, `out/`, `build/`, `next-env.d.ts`) ajouté dans `eslint.config.mjs` : `eslint .` lintait le build output dès qu'un `pnpm build` local avait eu lieu → des centaines d'erreurs et `/commit-push` cassé.

**Pourquoi :** audit "le template est-il prêt à démarrer un projet immédiatement" — les 4 checks (type-check, lint, test, build) passaient mais la home 404ait, le design system tournait sans animations ni dark mode class-based, et le lint cassait après un build local.

**Fichiers :**
- `src/app/(dashboard)/dashboard/page.tsx` (déplacé depuis `src/app/(dashboard)/page.tsx`)
- `src/app/globals.css`
- `eslint.config.mjs`

## [2026-05-02] — CLAUDE.md : ajout section "Avant de coder (CRITIQUE)"
**Quoi :** Ajout d'une section "Avant de coder" en tête du CLAUDE.md avec 4 règles : surfacer les hypothèses (pas trancher en silence), edits chirurgicaux (chaque ligne trace à la demande), critères de succès vérifiables, push back quand justifié. Suppression de la référence orpheline à "Règles d'exécution Bash" dans "Règles avant push" (section déjà retirée).
**Pourquoi :** cadrer le comportement de Claude en amont du code : éviter les implémentations trop larges, les refactos non demandés, et le "make it work" flou. Pousse l'agent à clarifier au lieu d'inventer.
**Fichiers :**
- `CLAUDE.md`

## [2026-05-02] — Tests rapatriés en local : CI = build only
**Quoi :**
- `/commit-push` exécute désormais 3 checks locaux : type-check + lint + tests (au lieu de 2).
- CI GitHub réduite à `pnpm build` uniquement (validation Vercel + erreurs Linux). Plus de duplication local/CI.
- CLAUDE.md "Règles avant push" mises à jour : suppression de l'interdiction "Ne JAMAIS lancer pnpm test localement".

**Pourquoi :** la séparation "lint/test sur CI uniquement" n'avait plus de sens depuis que l'environnement local est stable (TS 5.8.3 pin + hook PreToolUse). Lancer les tests en local accélère le feedback (plus besoin d'attendre la CI pour voir un test cassé), simplifie le mental model, et la CI reste un filet de sécurité Linux/build via `pnpm build`.

**Fichiers :**
- `.claude/commands/commit-push.md`
- `.github/workflows/ci.yml` (renommé "CI — Build", suppression des steps lint/tests)
- `CLAUDE.md` (section "Règles avant push")

## [2026-04-30] — CLAUDE.md : retrait de la section "Règles d'exécution Bash"
**Quoi :** Suppression de la section "Règles d'exécution Bash (TOUTES les commandes)" du CLAUDE.md (7 règles : pas de background, pas de pipe, pas de redirection, pas de boucle d'attente…).
**Pourquoi :** ces règles sont désormais appliquées par le hook `PreToolUse` (`.claude/hooks/enforce-bash-rules.sh`) au niveau système, plus besoin de les répéter dans le prompt. Réduit le bruit au chargement de chaque conversation et évite la duplication source de divergence.
**Fichiers :**
- `CLAUDE.md`

## [2026-04-30] — CLAUDE.md : règle de style de réponse (concis, pas de récap)
**Quoi :** Ajout d'une section "Style de réponse (CRITIQUE)" en tête du CLAUDE.md imposant des réponses courtes, sans récap qui répète l'user, sans tableaux décoratifs ni emojis non demandés, sans phrases d'intro/transition.
**Pourquoi :** réduire le bruit dans les réponses Claude pendant les workflows Tiple Method, particulièrement utile dans les sessions longues où chaque tour répétait inutilement le contexte.
**Fichiers :**
- `CLAUDE.md` (nouvelle section au début)

## [2026-04-19] — Consolidation : /tm-dev absorbe /tm-fix et /tm-feature, ajoute modes refacto et explore
**Quoi :**
- `/tm-dev` devient le **point d'entrée unique** pour toute action code avec 5 modes auto-détectés depuis l'argument : **story** (ID/`next`), **fix** (bug/corrige/cassé…), **feature** (ajoute/implémente…), **refacto** (nettoie/factorise, tests identiques avant/après), **explore** (comprends/analyse, **read-only**).
- `/tm-fix` et `/tm-feature` deviennent des **alias rétro-compatibles dépréciés** qui affichent un warning et exécutent le bon workflow de `/tm-dev`. Seront supprimés dans une prochaine version.
- CLAUDE.md et README.md mis à jour : nouvelle table commandes (2 points d'entrée principaux + 5 modes), table dépréciation, détail des 5 modes.

**Pourquoi :** retirer les redondances (tm-fix ≡ tm-dev libre, tm-feature ≡ tm-plan évolution) et combler les trous (mode refacto avec garde-fous "tests identiques", mode explore read-only). Une heuristique simple pour l'utilisateur : *docs → `/tm-plan`, code → `/tm-dev`*.

**Fichiers :**
- `.claude/commands/tm-dev.md` (refonte avec 5 modes + détection auto)
- `.claude/commands/tm-fix.md` (alias déprécié avec warning)
- `.claude/commands/tm-feature.md` (alias déprécié avec warning)
- `CLAUDE.md` (table commandes + ajustement "Mode libre")
- `README.md` (table commandes, table dépréciation, section "Les 5 modes de /tm-dev")

## [2026-04-19] — /tm-plan gère le mode évolution (V2) + README synchronisé
**Quoi :**
- `/tm-plan` détecte automatiquement si c'est un cadrage initial (pas de `docs/prd.md`) ou une évolution versionnée (V2/V3). En mode évolution : Edit > Write sur les docs existants, ADR obligatoire par invariant touché, création des nouveaux epics/stories uniquement, gate avec `prd-evolution.md` en plus du readiness-gate.
- README mis à jour : table des commandes complétée (ajout de `tm-feature`, `tm-wrap-up`, `commit-push` qui manquaient), `/tm-plan` décrit comme couvrant les deux modes, structure `.claude/` détaillée (commands/skills/hooks), section Qualité corrigée (type-check + lint local via `/commit-push`, tests sur CI GitHub).

**Pourquoi :** combler le trou méthodologique pour les grosses évolutions versionnées sans introduire un `/tm-plan-v2` redondant, et aligner le README sur l'état réel du framework (3 commandes + skills auto-déclenchés n'y figuraient pas).

**Fichiers :**
- `.claude/commands/tm-plan.md` (ajout de la section "Mode : initial ou évolution")
- `README.md` (table commandes, structure, section qualité, section V2)

## [2026-04-19] — Template : triggers bilingues, argument-hints, nouveau skill/command tm-wrap-up
**Quoi :**
- `argument-hint` ajoutés aux 3 slash commands qui prennent des arguments (tm-dev, tm-fix, tm-feature).
- Descriptions des 22 skills `.claude/skills/*/SKILL.md` enrichies avec des triggers bilingues FR+EN (mots-clés métier en français pour améliorer le déclenchement automatique).
- Nouveau workflow `/tm-wrap-up` (hybride) : command `.claude/commands/tm-wrap-up.md` pour le process complet + skill shim `.claude/skills/tm-wrap-up/` qui auto-propose à l'utilisateur de capturer les apprentissages méta (conventions, ADR, registry) à la fin d'un chantier. La règle : proposer, jamais exécuter silencieusement.

**Pourquoi :** inspiré de l'analyse du repo AlexisLaporte/claude-skills. L'objectif est (a) de fiabiliser le déclenchement automatique des conventions hors des workflows `/tm-dev` (les triggers FR couvrent la langue de travail), et (b) d'introduire un mécanisme de capture des **apprentissages méta** du projet, que le couple changelog+code ne couvre pas aujourd'hui.

**Fichiers :**
- `.claude/commands/tm-dev.md`, `tm-fix.md`, `tm-feature.md` (frontmatter)
- `.claude/commands/tm-wrap-up.md` (nouveau)
- `.claude/skills/tm-wrap-up/SKILL.md` (nouveau)
- `.claude/skills/{a11y,api,auth,database,datetime,deploy,feedback,flags,forms,i18n,monitoring,nextjs,performance,realtime,security,seo,state,supabase,tables,testing,typescript,uploads}/SKILL.md` (descriptions bilingues)
- `CLAUDE.md` (ajout de `/tm-wrap-up` dans la table des commandes)

## [2026-04-19] — Template : skills "shim" pour conventions
**Quoi :** Ajout de 22 skills Claude Code (un par tag de `.claude/conventions/_index.md`) dans `.claude/skills/`. Chaque skill est un shim ~8 lignes (frontmatter `name`+`description` + pointeur vers `.claude/conventions/<file>.md` + 2-3 invariants-clés).
**Pourquoi :** Les conventions étaient chargées uniquement par `/tm-dev` / `/tm-fix` via déduction de tags manuelle. Hors de ces workflows (édit libre, Q&A), elles étaient ignorées. Les skills permettent à Claude de les auto-déclencher contextuellement sans toucher à la source de vérité (`.claude/conventions/` inchangé) ni aux slash commands.
**Fichiers :**
- `.claude/skills/{auth,database,supabase,api,forms,realtime,security,nextjs,typescript,state,feedback,performance,tables,uploads,seo,a11y,i18n,datetime,monitoring,flags,deploy,testing}/SKILL.md` (22 nouveaux shims)
- `.gitignore` : whitelist `!.claude/skills/`
