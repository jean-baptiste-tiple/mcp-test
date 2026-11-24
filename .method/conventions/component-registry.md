# Component Registry

> Derniere MAJ : 2026-09-23 (E03-S01 à S03, S07)
> VERIFIER ce fichier AVANT de creer un composant/hook/util.

## UI Components (Shadcn/ui — installes)

| Composant | Path | Notes |
|-----------|------|-------|
| Accordion | `src/components/ui/accordion.tsx` | Radix, animation chevron |
| Alert | `src/components/ui/alert.tsx` | default, destructive |
| AlertDialog | `src/components/ui/alert-dialog.tsx` | Confirmation modale |
| Avatar | `src/components/ui/avatar.tsx` | Image + fallback initiales |
| Badge | `src/components/ui/badge.tsx` | 6 variants (default, secondary, destructive, outline, success, warning) |
| Breadcrumb | `src/components/ui/breadcrumb.tsx` | Fil d'ariane avec separateurs |
| Button | `src/components/ui/button.tsx` | 6 variants, 4 sizes, asChild |
| Calendar | `src/components/ui/calendar.tsx` | react-day-picker v9 |
| Card | `src/components/ui/card.tsx` | Header, Title, Description, Content, Footer |
| Checkbox | `src/components/ui/checkbox.tsx` | Radix Checkbox |
| Command | `src/components/ui/command.tsx` | Palette de commandes (cmdk) |
| Dialog | `src/components/ui/dialog.tsx` | Modal Radix |
| DropdownMenu | `src/components/ui/dropdown-menu.tsx` | Menu contextuel complet |
| Form | `src/components/ui/form.tsx` | Integration react-hook-form |
| Input | `src/components/ui/input.tsx` | Pill, fond bg-card, focus ring mint |
| Label | `src/components/ui/label.tsx` | Radix Label |
| Popover | `src/components/ui/popover.tsx` | Contenu flottant |
| Progress | `src/components/ui/progress.tsx` | Barre de progression |
| RadioGroup | `src/components/ui/radio-group.tsx` | Radix RadioGroup |
| ScrollArea | `src/components/ui/scroll-area.tsx` | Zone scrollable custom |
| Select | `src/components/ui/select.tsx` | Radix Select |
| Separator | `src/components/ui/separator.tsx` | Horizontal/vertical |
| Sheet | `src/components/ui/sheet.tsx` | Panneau lateral (4 directions) |
| Skeleton | `src/components/ui/skeleton.tsx` | Placeholder anime |
| Slider | `src/components/ui/slider.tsx` | Range input |
| Sonner | `src/components/ui/sonner.tsx` | Toast notifications |
| Spinner | `src/components/ui/spinner.tsx` | SVG anime, 3 tailles |
| Switch | `src/components/ui/switch.tsx` | Toggle on/off |
| Table | `src/components/ui/table.tsx` | Wrappers HTML table |
| Tabs | `src/components/ui/tabs.tsx` | Navigation par onglets |
| Textarea | `src/components/ui/textarea.tsx` | Champ multi-lignes |
| Toggle | `src/components/ui/toggle.tsx` | Bouton toggle |
| ToggleGroup | `src/components/ui/toggle-group.tsx` | Groupe de toggles |
| Tooltip | `src/components/ui/tooltip.tsx` | Info-bulle |

## Composants metier partages

| Composant | Path | Props cles | Notes |
|-----------|------|------------|-------|
| ThemeProvider | `src/components/theme-provider.tsx` | children, attribute, defaultTheme | Provider next-themes (client) |
| ThemeToggle | `src/components/theme-toggle.tsx` | — | Bouton toggle light/dark (client) |
| PageContainer | `src/components/page-container.tsx` | heading?, description?, children | Wrapper page max-w-7xl |
| EmptyState | `src/components/empty-state.tsx` | icon?, heading, description?, action? | Etat vide (listes, tables) |
| StatCard | `src/components/stat-card.tsx` | label, value, description?, icon?, trend? | KPI card pour dashboards (hover-lift, valeur mono) |
| DataTable | `src/components/data-table.tsx` | columns, data, emptyMessage? | Table generique typee |
| CopyButton | `src/components/copy-button.tsx` | value, label?, size?, variant? | Copie presse-papiers + feedback 2s (client) |
| AppLogo | `src/components/logo.tsx` | size?, label?, className? | Logo Tiple (SVG mint) — `label` = nom du produit |
| SidebarNav | `src/components/sidebar-nav.tsx` | — (items : `src/components/nav-items.ts`) | Nav sidebar sombre, item actif pill mint (client, usePathname) |
| ScopeList | `src/components/scope-list.tsx` | scopes | Scopes OAuth en pilules, casse d'origine, « Aucun scope » si vide — /oauth/consent et /auth-test/grants (E03-S03) |
| LoginForm | `src/app/(auth)/login/login-form.tsx` | redirectTo? | Formulaire de /login (client) : pending, erreur inline, `redirect` en champ caché |
| ConsentForm | `src/app/(auth)/oauth/consent/consent-form.tsx` | authorizationId | Autoriser / Refuser (client) : pending, erreur inline |
| RevokeButton | `src/app/(auth)/auth-test/grants/revoke-button.tsx` | clientId, clientName | Révoquer un client autorisé (client) : pending, erreur sous le bouton |
| LogoutButton | `src/app/(auth)/auth-test/grants/logout-button.tsx` | — | Bouton Déconnexion (client, `useFormStatus`) dans le `<form action={logout}>` serveur : désactivé et `aria-busy` pendant la déconnexion |

## Hooks

| Hook | Path | Retourne | Notes |
|------|------|----------|-------|
<!-- Ajouter ici chaque hook custom cree -->

## Server Actions

| Action | Path | Input -> Output | Notes |
|--------|------|-----------------|-------|
<!-- Ajouter ici chaque Server Action creee -->
| login | src/lib/actions/auth.ts | FormData (email, password, redirect?) -> redirect(safeRedirect) ou { error } | loginSchema, message générique sur refus, revalidatePath layout (E03-S03) |
| logout | src/lib/actions/auth.ts | () -> redirect /login | `signOut({ scope: "local" })` : garde les sessions OAuth des assistants du compte ; utilisé par /auth-test/grants |
| approve, deny | src/app/(auth)/oauth/consent/actions.ts | authorizationId -> redirect(redirect_url) ou { error } | Session puis authorizationIdSchema, détails relus pour le journal, `skipBrowserRedirect: true`, journal approved / denied ; relecture qui rend déjà `redirect_url` : approve journalise `auto` et redirige, deny rend un message. Exporte aussi `type Decision` (importé par ConsentForm) |
| revoke | src/app/(auth)/auth-test/grants/actions.ts | clientId -> { data: { clientId } } ou { error } | clientIdSchema, `revokeGrant({ clientId })` puis revalidatePath(GRANTS_PATH) |

## Shared Schemas (Zod)

| Schema | Path | Champs cles | Utilise par |
|--------|------|-------------|-------------|
| BenchMutateInput | src/lib/schemas/bench-mutate.ts | action (enum), name, title, description, input_schema, instructions | tool `bench_mutate` (seule mutation du banc) |
| inputSchemas(prefix) | src/proto/schemas.ts | entrées des six outils proto (zod/v4) ; `toInputSchema`, `parseInput` | adaptateur MCP proto (validation + inputSchema servi) |
| loginSchema | src/lib/schemas/auth.ts | email, password (≥ 8), redirect? | action `login` |
| authorizationIdSchema | src/lib/schemas/auth.ts | `authorization_id` Supabase ([A-Za-z0-9_-], ≤ 255 : jamais de `/` dans le chemin du SDK) | page /oauth/consent, actions approve / deny |
| clientIdSchema | src/lib/schemas/auth.ts | identifiant d'un client OAuth (UUID) | action `revoke` |

## Utils

| Util | Path | Usage |
|------|------|-------|
| cn | src/lib/utils/cn.ts | Merge Tailwind classes (clsx + tailwind-merge) |
| getAdminClient | src/lib/supabase/admin.ts | Client Supabase clé secrète, `server-only`, mémoïsé, typé `Database` — SEUL accès aux tables du banc (ADR-002). Jamais depuis un Client Component |
| byteLength, truncateToBytes | src/lib/utils/byte-size.ts | Taille UTF-8 d'un texte, troncature à N octets (plafonds d'arguments et de journal) |
| getProtoClient | src/lib/supabase/admin.ts | Client clé secrète typé `ProtoDatabase`, schéma `proto` — serveur proto seulement (ADR-003) |
| createClient | src/lib/supabase/server.ts | Client Supabase au nom de l'utilisateur connecté (cookies, `@supabase/ssr`) : Server Components et actions des pages d'auth (E03-S03) |
| safeRedirect, loginPath, consentPath, DEFAULT_REDIRECT | src/lib/schemas/auth.ts | Garde du retour après connexion (chemin du site seulement, sinon /auth-test/grants) ; `/login?redirect=…` (aussi dans le middleware), `/oauth/consent?authorization_id=…` |
| GRANTS_PATH, SITE_BRAND, UNNAMED_CLIENT | src/lib/schemas/auth.ts | Constantes uniques des pages d'auth : `/auth-test/grants` (page, action revoke, retour par défaut), « Banc MCP » (login, consentement d'un hôte sans organisation), « Client sans nom » (consentement, clients autorisés) |
| sanitizeText | src/lib/utils/sanitize-text.ts | `(value, maxChars)` : retire NUL et surrogates isolés (refusés par Postgres), tronque à une frontière de code point — journal auth-test (`method`, `client_name`, `tool`). `src/mcp/bench/events.ts` garde sa copie (remplacement par U+FFFD) |
| logConsent, requestInfo | src/app/(auth)/oauth/consent/consent-journal.ts | Ligne `consent` du journal auth-test (shown, approved, denied, auto ; jamais l'authorization_id ni le code) ; hôte et navigateur de la requête |
| must, many, one | src/proto/db.ts | Lecture d'une réponse supabase-js (optionnelle, liste, ligne attendue) ; panne → `Proto store unavailable` |
| resolveIdentity, canRead | src/proto/identity.ts | Utilisateur du segment d'URL → org, équipes (membre ou non, responsable) ; règle de lecture des nœuds |
| requireCtx, issueCtx | src/proto/services/ctx.ts | Émission et garde du code ctx (absent, inconnu, autre utilisateur, règles changées) |
| renderContext, buildContext | src/proto/services/context.ts | Blocs de context par priorité, budget coupé par la fin ; candidats et étapes servies (S02) |
| rankCandidates, decide, blendScore | src/proto/services/routing.ts | Routage lexical : composantes SQL (`proto.route_candidates`) → score 0–1, seuil 0,65, écart 0,1 |
| find | src/proto/services/find.ts | Trois candidats avec score, consigne de demander sous le seuil ; fonctions du catalogue (S04) |
| read, write | src/proto/services/read.ts, write.ts | Lecture par plan, section, révision ; écriture par opérations, brouillon, publication, garde de révision |
| applyOps | src/proto/services/sections.ts | Opérations par section adressée par son titre (pures) |
| callFunction | src/proto/services/call.ts | Droits d'équipe, arguments, confirmation en deux temps |
| FUNCTIONS, defineFunction, describeFunction, searchFunctions | src/proto/functions/ | Catalogue des 13 fonctions (tableaux, sellsy, mail, slack, probe) |
| canWrite, describeTeam | src/proto/identity.ts | Règle d'écriture ; équipe et responsable nommés dans un refus |
| listPrompts, getPrompt | src/proto/services/prompts.ts | Prompts suggérés tirés des procédures (`meta.suggested`) |
| flushJournal, initializeEntries, loggedArgs | src/proto/services/journal.ts | Journal proto : écriture qui n'échoue jamais, client de l'initialize, arguments tronqués à 2 ko |
| buildTools, toolKey, serverInstructions | src/proto/mcp/tools.ts | Six outils par organisation (préfixe, descriptions, inputSchema) |
| installProto, buildServerOptions | src/proto/mcp/server.ts | Adaptateur MCP proto (handlers bas niveau, garde ctx, journal) |
| readEnv | scripts/lib/env.mjs | `.env.local` hors Next (scripts et tests proto et auth-test) ; bench-seed.mjs garde sa propre copie |
| seedProto, deleteProtoOrgs, protoOrgSlugs | scripts/lib/proto-seed.mjs | Données Acme et Delta en base ; orgs jetables suffixées pour les tests |
| getOauthTestClient | src/lib/supabase/admin.ts | Client clé secrète typé `OauthTestDatabase`, schéma `oauth_test` : journal, scripts, résolution de l'organisation par hôte, marque du consentement (ADR-004 §6) ; jamais pour lire au nom de l'utilisateur |
| userClient, must, STORE_UNAVAILABLE | src/auth-test/db.ts | Client au jeton de l'utilisateur (clé publique + `Authorization: Bearer`, RLS) ; panne → `STORE_UNAVAILABLE` (`Auth-test store unavailable`), rendu tel quel par http.ts (503) |
| normalizeHost, requestHost, resolveOrg, isMember | src/auth-test/orgs.ts | Hôte (`x-forwarded-host` puis `host`) → organisation (clé secrète) ; appartenance relue sous le jeton, par la seule RLS |
| summarizeClaims, claimColumns, rpcCalls, flushJournal | src/auth-test/journal.ts | Résumé de claims (dix clés admises, jamais le jeton), colonnes d'identité d'une entrée, messages JSON-RPC d'un body, écriture qui n'échoue jamais (`{ code, message }` en console seulement) |
| makeVerifyToken, rejectionOf, authClaims, projectIssuer | src/auth-test/token.ts | Vérification JWKS (jose, injectable pour les tests), motif de rejet réservé au journal, issuer dérivé de `NEXT_PUBLIC_SUPABASE_URL` |
| handleMcpPost, handleMcpRefused, handleMetadata | src/auth-test/http.ts | Logique HTTP du serveur auth-test à dépendances injectées (404 hôte inconnu, `withMcpAuth`, 405, métadonnées RFC 9728) ; les `route.ts` branchent le réel |
| buildTools, toolKey, serverInstructions, WhoamiInput, EchoInput | src/auth-test/mcp/tools.ts | `<prefix>_whoami` et `<prefix>_echo` (zod/v4, `securitySchemes` dans `_meta`) |
| installAuthTest, buildServerOptions | src/auth-test/mcp/server.ts | Adaptateur MCP auth-test : garde d'appartenance avant tout outil, journal par message |
| seedOauthTest, ensureUser, setMember, deleteOauthTestOrgs | scripts/lib/oauth-seed.mjs (+ .d.mts) | Acme et Delta avec leurs hôtes, comptes de test (jamais modifiés s'ils existent), appartenances ; orgs et hôtes jetables suffixés pour les tests |
| OAUTH_ORGS, ACME_HOST, DELTA_HOST, JB_EMAIL, ALIAS_EMAIL | scripts/lib/oauth-data.mjs (+ .d.mts) | Source unique des données auth-test |
| oauth-seed, oauth-member, oauth-admin | scripts/oauth-seed.mjs, oauth-member.mjs, oauth-admin.mjs (+ lib/oauth-admin.mjs) | `pnpm oauth:seed` ; `pnpm oauth:member <org> <email> add|remove` ; `pnpm oauth:admin columns|clients|authorizations|consents|sessions <email>|revoke-sessions <email> --yes|revoke-grants <email> <client> --yes` |
| oauth_test.registered_clients(), oauth_authorizations(email?), oauth_consents(email?), user_sessions(email), revoke_user_sessions(email), revoke_client_grants(email, client), auth_columns() | supabase/migrations/*_oauth_test_admin*.sql | Fonctions `security definer` réservées à `service_role` : lecture des tables `auth` du serveur OAuth sans secrets (`resource`, scopes, adresses de retour, sessions), révocation (E03-S07) |

## Types partages

| Type | Path | Usage |
|------|------|-------|
| BenchScenarioRow, BenchToolRow, BenchEventInsert | src/mcp/bench/repository.ts | Alias des types générés `Database` — ne pas redéfinir |
| BenchRepository, SupabaseBenchRepository | src/mcp/bench/repository.ts | Accès aux tables du banc ; client injecté ; mutations (updates posent `updated_at`), `hasRecentReadmeCall` |
| ProtoDatabase, Proto*Row | src/types/proto-database.ts | Types du schéma `proto`, écrits à la main au format gen types (à régénérer quand le jeton revient) |
| Identity, Team | src/proto/identity.ts | Qui appelle le serveur proto |
| ServiceResult, ProtoError | src/proto/result.ts | Contrat service → adaptateur (texte ou refus actionnable) |
| BenchSnapshot, loadSnapshot | src/mcp/bench/snapshot.ts | Scénario actif + tools activés, relu à chaque requête ; snapshot vide fabriqué à neuf (jamais partagé) |
| parseRpcBody, logEvents | src/mcp/bench/events.ts | Journal JSON-RPC → `bench_events` (`BenchEventInsert`), plafonné à 100 événements par requête, jamais bloquant |
| Handler, ToolHandler, dispatchToolCall | src/mcp/bench/registry.ts | Dispatch par `handler`, gardes ack / gate, erreurs actionnables ; les handlers sont dans `handlers/` |
| applyLever | src/mcp/bench/levers.ts | Fonction pure : lignes → tools JSON Schema brut + six leviers readme (textes d'architecture §6) |
| makeAck, verifyAck, getAckSecret | src/mcp/bench/ack.ts | Ack HMAC-SHA256 base32 12 car., fenêtre TTL, `timingSafeEqual`, secret requis en prod |
| BenchRequestContext, outcomeFor | src/mcp/bench/context.ts | Contexte par requête (server, repo, headers, fingerprint, requestId brut, outcomes) |
| whoamiHandler, mutateHandler, readmeHandler, echoHandler | src/mcp/bench/handlers/*.ts | Les 4 sondes ; `mutate` = seule mutation réelle |
| MemoryBenchRepository | src/mcp/bench/repository.memory.ts | Implémentation mémoire pour les tests (extraite de `repository.ts`) |
| isRecord | src/lib/utils/is-record.ts | Garde de type objet simple (events, levers, journal auth-test) |
| makeScenario, makeTool | tests/factories/bench.factory.ts | Fixtures scénario / tool de test |
| ACME_ORG, DELTA_ORG, ORGS_BY_HOST, TEST_ISSUER | tests/factories/oauth-test.factory.ts | Lignes `oauth_test.orgs` tirées de `OAUTH_ORGS` (oauth-data.mjs) et émetteur des jetons de test : tests sans base du serveur auth-test (route, métadonnées, outils) |
| PROBES, BASELINE | scripts/lib/probes.mjs | Source unique des 4 sondes et du scénario `baseline` (les migrations ne sont qu'un amorçage) |
| buildCatalogue, canary, fillText | scripts/lib/catalogue.mjs (+ .d.mts) | Catalogue déterministe des scénarios du banc, canaris `[C:slug:field:pos:hex]` |
| bench-seed | scripts/bench-seed.mjs | `pnpm bench:seed` : upsert idempotent des scénarios et tools, restaure `baseline`, jamais `is_active` |
| OauthTestDatabase, OauthTest*Row | src/types/oauth-test-database.ts | Types du schéma `oauth_test` (tables et `Functions`), écrits à la main au format gen types |
| JournalEntry, TokenSummary, RequestFacts, RpcCall | src/auth-test/journal.ts | Entrée du journal auth-test (`token` = résumé, jamais brut), faits d'une requête, message JSON-RPC |
| seedTestOrgs, createTestUser, signIn, signInSession, anonDb, stubPublicEnv, testDb, hasDb | tests/integration/auth-test-helpers.ts | Orgs et hôtes jetables, utilisateurs jetables (`auth.admin`), jetons réels par mot de passe, client anonyme ; tests sautés sans clés |
