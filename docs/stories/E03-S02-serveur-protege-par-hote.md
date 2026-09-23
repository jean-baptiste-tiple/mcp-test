# Story E03-S02 — Serveur MCP protégé par hôte : métadonnées, 401, jeton, appartenance, whoami et echo

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, auth, security, typescript, testing |
| **Estimation** | L |

## Contexte

Le resource server de l'ADR-004 : deux hôtes, un endpoint, deux outils, et tout ce que les hosts liront avant d'appeler (métadonnées RFC 9728 par hôte, 401 `WWW-Authenticate`). Le jeton dit qui appelle ; l'hôte dit pour quelle organisation ; la base dit si la personne en est membre, à chaque appel. Parallèle à S03 : aucun fichier commun.

Dépendance installée par le pilote avant le lancement : `jose` (JWKS distante, signature ES256, `iss`, `exp`).

**Refs :**
- PRD : FR-AUTH-01 à FR-AUTH-07, critères « preuves sans host », NFR-AUTH-01, NFR-AUTH-02
- Architecture : §10.2, §10.4, §10.6, §10.7 ; ADR-001 (stateless), ADR-004
- Conventions : mcp-patterns §2.1, §3, §4, §6, §6 bis, §10
- Starter : `.claude/starters/mcp/auth.ts` (verifyToken, requireAuthContext), `oauth-protected-resource-route.ts`, bloc `withMcpAuth` de `mcp-route.ts`. `mcp-handler` 1.1.0 : `withMcpAuth(handler, verifyToken, { required, resourceMetadataPath, resourceUrl })` prend l'origine dans `x-forwarded-host` / `x-forwarded-proto` (Vercel les pose) et construit `resource_metadata = origine + resourceMetadataPath` ; `generateProtectedResourceMetadata`, `metadataCorsOptionsRequestHandler`
- Modèle : `src/app/api/proto/u/[user]/[transport]/route.ts` (handler par requête, 404 JSON-RPC, `after()`), `src/proto/mcp/server.ts` (handlers bas niveau), `src/mcp/tool-result.ts`
- Supabase (docs 2026-09-23) : jeton d'accès = JWT Supabase (`sub`, `role`, `aud` `authenticated`, `email`, `client_id`, `session_id`, `amr`, `iss` `https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1`), JWKS ES256 sur `/auth/v1/.well-known/jwks.json`

## Critères d'acceptation

- [ ] **Given** un hôte inconnu (`x-forwarded-host` ou `host` sans ligne `oauth_test.orgs`) **When** toute requête sur `/api/auth-test/mcp` **Then** 404, corps JSON-RPC « Unknown host », rien d'autre ; journal `unknown_host`
- [ ] **Given** l'hôte Acme **When** `POST /api/auth-test/mcp` sans en-tête `Authorization` **Then** 401, corps JSON `{"error":"invalid_token",…}`, `WWW-Authenticate` = `Bearer error="invalid_token", error_description="…", resource_metadata="https://<hôte Acme>/.well-known/oauth-protected-resource/api/auth-test/mcp"` ; journal `unauthenticated` ; même chose pour l'hôte Delta avec son propre hôte dans `resource_metadata`
- [ ] **Given** un jeton signé par une autre clé (paire ES256 générée dans le test), un jeton expiré, ou un jeton dont `iss` n'est pas celui du projet **Then** 401 `invalid_token` ; journal `invalid_token` avec le motif (`signature`, `expired`, `issuer`), sans le jeton
- [ ] **Given** chaque hôte connu **When** `GET /.well-known/oauth-protected-resource` et `GET /.well-known/oauth-protected-resource/api/auth-test/mcp` **Then** JSON RFC 9728 : `resource` = `https://<hôte>/api/auth-test/mcp`, `authorization_servers` = `["https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1"]` (dérivé de `NEXT_PUBLIC_SUPABASE_URL`), `scopes_supported` = `["openid","email","profile","offline_access"]`, `bearer_methods_supported` = `["header"]`, `resource_documentation` = `https://<hôte>/auth-test/grants` ; `Access-Control-Allow-Origin: *` ; `OPTIONS` répond ; hôte inconnu : 404 ; toute lecture journalisée (`metadata`, hôte, chemin, user-agent)
- [ ] **Given** un jeton valide **When** `initialize` **Then** `serverInfo` `{ name: "<slug>-auth-test", title: "<name> (auth test)", version }`, instructions d'une phrase ; `tools/list` = exactement `<prefix>_whoami` et `<prefix>_echo`, descriptions en anglais « Use this when… / Do not use for… », `.describe()` sur chaque champ, `securitySchemes` oauth2 dans `_meta` de chaque outil ; noms ASCII ≤ 64
- [ ] **Given** un jeton valide d'un membre **When** `<prefix>_whoami {note?}` **Then** texte et `structuredContent.text` identiques ; `structuredContent` porte `person {id, email}`, `organisation {slug, name, host, prefix}`, `membership {member: true, role}`, `token {iss, aud, client_id, session_id, iat, exp, expires_in_s, amr, scope?}`, `request {host, path, user_agent}`, `note`, `next_actions` ; jamais le jeton brut (test : la sérialisation ne contient pas le jeton)
- [ ] **Given** un jeton valide d'un non-membre **When** `tools/list` **Then** servi ; **When** `whoami` ou `echo` **Then** `isError`, texte exactement « You are signed in as <email> but you are not a member of <Org name>. Ask an administrator of <Org name> to add you. », aucun autre champ ; journal `denied_not_member`
- [ ] **Given** un membre **When** `setMember(…, "remove")` puis un appel avec le même jeton **Then** refusé (aucun cache d'appartenance) ; `add` puis appel : accepté
- [ ] **Given** `<prefix>_echo {message, …}` **Then** les arguments reçus, sérialisés, dans le texte et `structuredContent.args` ; plafond 64 ko → `isError` actionnable
- [ ] **Given** chaque requête (initialize, tools/list, tools/call, 401, 404, métadonnées) **Then** une ligne `oauth_test.journal` (host, path, method, tool, decision, user_id, email, org_slug, client_id, client_name à l'initialize, token résumé, user_agent, ip) écrite dans `after()` ; un échec du journal ne change pas la réponse
- [ ] **Given** `GET` et `DELETE` sur `/api/auth-test/mcp` **Then** 405 (pas de flux SSE, ADR-001)
- [ ] **Given** `/api/mcp` et `/api/proto/u/jb/mcp` **Then** inchangés (`pnpm mcp:smoke` en local, tests `proto-*` verts)

## Implémentation

### Fichiers à créer
- `src/auth-test/token.ts` : `makeVerifyToken({ jwks, issuer })` → `(req, bearer) => AuthInfo | undefined` (jose `jwtVerify`, `issuer`, `clockTolerance` 5 s ; `extra` = `{ claims: summarizeClaims(payload) }`) ; par défaut `createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"))` mémoïsée par process ; le motif de rejet va au journal, pas au client
- `src/auth-test/mcp/tools.ts` : définitions des deux outils par préfixe (nom, description, inputSchema plat, `_meta.securitySchemes`)
- `src/auth-test/mcp/server.ts` : `buildServerOptions(org)`, `installAuthTest(server, deps)` : handlers bas niveau `tools/list`, `tools/call` ; garde d'appartenance (`isMember` sous le jeton) avant tout outil ; `whoami`, `echo` ; entrées de journal
- `src/app/api/auth-test/[transport]/route.ts` : POST : hôte → `resolveOrg` (404 sinon) → `withMcpAuth(handler, verify, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/auth-test/mcp" })` → `createMcpHandler(…, { basePath: "/api/auth-test", disableSse: true })` → `after(flushJournal)` ; GET/DELETE 405. Journaliser aussi les réponses 401 (statut de la réponse de `withMcpAuth`)
- `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts` : GET (hôte → organisation, 404 sinon ; `generateProtectedResourceMetadata` avec `resourceUrl` calculé depuis l'hôte), OPTIONS (`metadataCorsOptionsRequestHandler`)
- `tests/unit/auth-test-route.test.ts` : `Request` construites avec `x-forwarded-host` ; JWKS locale (`generateKeyPair("ES256")` + `createLocalJWKSet`) injectée dans `makeVerifyToken` ; 401 par hôte (absent, autre clé, expiré, autre `iss`), `resource_metadata` par hôte, 404 hôte inconnu, 405 ; résolution d'organisation injectée (pas de réseau)
- `tests/unit/auth-test-metadata.test.ts` : métadonnées par hôte, variante suffixée, 404, CORS, OPTIONS
- `tests/unit/auth-test-tools.test.ts` : noms, descriptions, `securitySchemes`, préfixes Acme et Delta
- `tests/integration/auth-test-server.test.ts` : organisations et hôtes jetables (helpers S01), utilisateur jetable, jeton réel par `signInWithPassword` vérifié par la vraie JWKS ; `InMemoryTransport` avec l'`AuthInfo` issu de `makeVerifyToken` : whoami membre (organisation et préfixe de l'hôte), non-membre refusé, retrait puis refus, echo, journal écrit, `structuredContent.text === content[0].text`

### Fichiers à modifier
- `docs/architecture.md` §10.4 si l'implémentation s'en écarte ; `README.md` : section « Serveur auth-test (E03) » (URL par hôte, ce qu'on prouve, ADR-004)

### Patterns à suivre
- mcp-patterns §3 (descriptions, schémas plats), §4 (texte + structuredContent, erreurs actionnables), §6 (401 partout, jamais de mode anonyme), §6 bis (route publique = auth propre)
- `coding-standards.md` §Surfaces nouvelles : en-tête de chaque fichier ; `**Écarté :**` au changelog
- Interdit : `src/proto/`, `src/mcp/`, `src/app/api/[transport]/`, `src/app/api/proto/`, `src/middleware.ts`, `src/app/(auth)/`, `src/app/oauth/`, `src/app/auth-test/` (S03)

## Tests attendus

### Unit tests
- [ ] `auth-test-route.test.ts` : 404 hôte inconnu, 401 × 4 motifs, `WWW-Authenticate` par hôte, 405
- [ ] `auth-test-metadata.test.ts` : deux formes d'URL par hôte, 404, CORS, OPTIONS
- [ ] `auth-test-tools.test.ts` : définitions Acme et Delta

### Integration tests
- [ ] `auth-test-server.test.ts` : jeton réel, membre, non-membre, retrait, echo, journal, parité texte / structuredContent

### E2E tests
- [ ] S04 : smoke HTTP sur les deux hôtes déployés

## Post-implémentation

Implémentée le 2026-09-23 par Opus (agent) ; review isolée : voir Notes.

### Écarts avec l'architecture
- La logique vit dans `src/auth-test/http.ts` (`handleMcpPost`, `handleMcpRefused`, `handleMetadata`, dépendances injectées) ; les deux `route.ts` branchent le client secret, la JWKS réelle et `after()`. Architecture §10.2 mise à jour.
- Consignes de la review S01 appliquées : whoami rend `membership: { member: true }` (`isMember`) ; une ligne 401 ou 404 ne porte aucune identité ; seul le résumé de claims va au journal.
- Motifs de rejet en plus de la story : `claims` (`exp` ou `sub` absent), `error` (JWKS injoignable, console). Motifs de `tools/call` : `unknown_tool`, `args_too_large`, `invalid_args` ; base injoignable pendant l'appartenance : `membership_unavailable` sous `denied_not_member` (aucune valeur de `decision` pour « base indisponible »). Métadonnées : `unknown_host`, `unknown_path`, `store_unavailable` ; tout autre suffixe que `/api/auth-test/mcp` rend 404.
- GET et DELETE : hôte inconnu 404 journalisé ; hôte connu 405 sans auth ni journal. Le contrôle 401 se fait donc en POST JSON-RPC (protocole §9.1).
- Une ligne de journal par message JSON-RPC ; `notifications/initialized` et `ping` en `allowed`. `expiresAt` n'est pas transmis à `withMcpAuth` (il revérifierait `exp` sans tolérance ni motif). Base injoignable sur la route MCP : 503 JSON-RPC sans journal.
- `securitySchemes: [{ type: "oauth2" }]` sans `scopes: []` (une liste vide risquerait de faire demander aucun scope, donc pas d'`offline_access`) ; placé dans `_meta` ; ChatGPT le lit-il là : à mesurer (S06).
- Point d'attention 1 de l'architecture vérifié : `createMcpHandler` par requête ne garde aucune référence sur le chemin POST (mcp-handler 1.1.0).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `makeVerifyToken`, `rejectionOf`, `authClaims`, `projectIssuer` | `src/auth-test/token.ts` | jose, JWKS injectable |
| `handleMcpPost`, `handleMcpRefused`, `handleMetadata` | `src/auth-test/http.ts` | logique HTTP, dépendances injectées |
| `WhoamiInput`, `EchoInput`, `buildTools`, `toolKey`, `serverInstructions` | `src/auth-test/mcp/tools.ts` | zod/v4 |
| `buildServerOptions`, `installAuthTest` | `src/auth-test/mcp/server.ts` | handlers bas niveau |
| `requestHost` | `src/auth-test/orgs.ts` | `x-forwarded-host` puis `host`, normalisé (à utiliser par la page de consentement) |
| `claimColumns`, `RequestFacts`, `RpcCall`, `rpcCalls` | `src/auth-test/journal.ts` | |
| Routes | `src/app/api/auth-test/[transport]/route.ts`, `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts` | |

### Option plus simple écartée
La logique dans les deux `route.ts` comme le proto, testée par `vi.mock` : chaque fichier de test aurait eu 4 à 5 modules simulés (`next/server` pour `after()`, client secret, JWKS, journal) et la chaîne réelle `withMcpAuth` + `createMcpHandler` n'aurait tourné que derrière eux. Écarté aussi : s'en remettre aux messages de `withMcpAuth` (« No authorization provided » pour tout 401 : le journal ne distinguerait pas `expired` de `signature`, preuve 8).

### Notes
- Checks verts (30 fichiers, 342 tests) ; l'intégration a vérifié un vrai jeton `signInWithPassword` avec la JWKS du projet. `pnpm build` non lancé pendant les lots parallèles : lancé par le lot de corrections.
- `/api/mcp` et `/api/proto/*` inchangés.
- Review isolée (2026-09-23) : 0 HAUTE, 2 MOYENNE, 8 BASSE, traitées le jour même : journal plafonné à 100 messages, lecture d'hôte unifiée (`requestHost` côté consentement), corps JSON invalide → 400 `parse_error` (la requête restait pendue 60 s), refus HTTP du transport journalisés, `sanitizeText` sur les colonnes texte, `STORE_UNAVAILABLE` partagée, factory de test, tests de tolérance et de motifs, rewrite de la variante d'URL des métadonnées. Dette : `sanitizeText` duplique la copie du banc (`src/mcp/bench/events.ts`), à fusionner un jour.
- Review consolidée des deux lots de corrections (2026-09-23) : APPROVED, 4 BASSE non bloquants : `Promise.all` restant dans le nettoyage d'`auth-test-server.test.ts` ; tests manquants (`rpcCalls` avec méthode non-chaîne, nom d'outil avec NUL, chemin `membership_unavailable`) ; suppression réelle des sessions OAuth par `revoke_client_grants` à vérifier en campagne (preuve 8) ; `authorization_id` rendu par `oauth_authorizations()` (service_role seul, à filtrer par cohérence).
