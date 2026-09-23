# Story E03-S03 — Connexion, consentement, clients autorisés

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Must |
| **Référence UI** | Description : `/login` = page du starter supabase-auth réduite (email, mot de passe, bouton, erreur inline ; sans liens signup ni mot de passe oublié) ; `/oauth/consent` = carte centrée : marque de l'organisation de l'hôte (nom) ou « Banc MCP », nom du client avec son logo et son site s'ils existent, adresse de retour, liste des scopes, compte connecté, boutons Autoriser (primaire) et Refuser ; `/auth-test/grants` = liste des clients autorisés (nom, scopes, date) avec Révoquer, bouton Déconnexion. Design system Tiple (`.page-canvas`, `bg-card`, pilules) |
| **Conventions** | auth, supabase, nextjs, security, testing |
| **Estimation** | M |

## Contexte

Ce que le serveur OAuth de Supabase attend de l'application : une page de connexion et, à l'adresse de site + `/oauth/consent`, une page qui lit `authorization_id`, montre le client et laisse approuver ou refuser. C'est là que s'observe ce que chaque host envoie (nom du client, adresse de retour, scopes) : la page journalise chaque affichage et chaque décision. La page des clients autorisés montre les enregistrements du point de vue de l'utilisateur et permet de révoquer un accès (preuve 8). Parallèle à S02 : aucun fichier commun.

Dépendance installée par le pilote avant le lancement : `@supabase/ssr`. `NEXT_PUBLIC_SUPABASE_ANON_KEY` est déjà dans `.env.local`.

**Refs :**
- PRD : FR-AUTH-07 (journal `consent`), FR-AUTH-08, NFR-AUTH-01
- Architecture : §10.2, §10.5, §10.6 ; ADR-004 §7, §8
- Starter : `.claude/starters/supabase-auth/` (README, `supabase-server.ts`, `supabase-client.ts`, `middleware.ts`, `auth-actions.ts`, `auth-layout.tsx`, `login-page.tsx`) ; `auth-patterns.md` §Login, §Middleware, §Sécurité Auth
- Supabase (docs OAuth server « getting started », 2026-09-23) : redirection vers `<site URL>/oauth/consent?authorization_id=<id>` ; `supabase.auth.oauth.getAuthorizationDetails(id)` rend soit `{ authorization_id, client {id, name, uri, logo_uri}, redirect_uri, user {id, email}, scope }` (consentement à afficher), soit `{ redirect_url }` (déjà consenti → rediriger) ; `approveAuthorization(id, { skipBrowserRedirect: true })` et `denyAuthorization(id, …)` rendent `{ redirect_url }` ; `listGrants()` rend `[{ client, scopes, granted_at }]`, `revokeGrant(clientId)` ; sans session : rediriger vers la connexion en conservant `authorization_id`
- Design : `docs/design/system.md`, `src/app/globals.css` (`.page-canvas`, `.noise-overlay`), composants `src/components/ui/` (Card, Button, Input, Label, Badge)

## Critères d'acceptation

- [ ] **Given** `/login` **When** email et mot de passe valides **Then** session posée (cookies `@supabase/ssr`) et redirection vers `redirect` s'il commence par `/` et pas par `//` (sinon `/auth-test/grants`) ; identifiants faux : erreur inline, pas de redirection ; la page n'a ni lien signup ni mot de passe oublié ; `autoComplete` posés
- [ ] **Given** `/oauth/consent?authorization_id=X` sans session **Then** redirection vers `/login?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3DX` ; sans `authorization_id` : message d'erreur, pas d'appel SDK
- [ ] **Given** une session et des détails rendus par `getAuthorizationDetails` **Then** la page montre : la marque de l'organisation dont `host` est celui de la requête (`resolveOrg`, client secret) ou « Banc MCP » ; `client.name`, `client.uri`, `client.logo_uri` s'ils existent ; `redirect_uri` ; les scopes un par un ; l'email du compte ; Autoriser et Refuser
- [ ] **Given** Autoriser **Then** `approveAuthorization(id, { skipBrowserRedirect: true })` puis `redirect(redirect_url)` ; Refuser → `denyAuthorization` puis redirection ; `getAuthorizationDetails` rend `{ redirect_url }` → redirection immédiate ; erreur SDK → message et aucune redirection
- [ ] **Given** chaque affichage et chaque décision **Then** une ligne `oauth_test.journal` `decision = consent`, `consent` jsonb `{ stage: "shown" | "approved" | "denied" | "auto", client: {id, name, uri, logo_uri}, redirect_uri, scope }`, `host`, `email`, `user_id`, `user_agent` ; jamais l'`authorization_id` complet ni un code
- [ ] **Given** `/auth-test/grants` avec session **Then** `listGrants()` affiché (nom du client, scopes, `granted_at`), Révoquer → `revokeGrant(client.id)` puis liste rafraîchie ; état vide « Aucun client autorisé » ; bouton Déconnexion (`signOut`, retour `/login`) ; sans session → `/login?redirect=/auth-test/grants`
- [ ] **Given** `src/middleware.ts` **Then** `config.matcher` = `["/login", "/oauth/:path*", "/auth-test/:path*"]` ; un test vérifie qu'aucun de `/`, `/api/mcp`, `/api/proto/u/jb/mcp`, `/api/auth-test/mcp`, `/.well-known/oauth-protected-resource`, `/design-system` ne correspond au matcher ; le middleware rafraîchit la session et redirige vers `/login` (avec `redirect`) les pages `/oauth/*` et `/auth-test/*` sans utilisateur
- [ ] **Given** les pages **Then** Server Components par défaut, `"use client"` seulement sur le formulaire de connexion et les boutons ; états loading / error / empty ; tokens du design system, aucune couleur en dur ; contraste AA (texte accent = `text-primary-dark`)
- [ ] **Given** `pnpm type-check`, `pnpm lint`, `pnpm test` **Then** verts

## Implémentation

### Fichiers à créer
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` : copie du starter
- `src/lib/actions/auth.ts` : `login(formData)` (Zod `lib/schemas/auth.ts` : email, password ≥ 8, redirect optionnel), `logout()` ; pas de signup / forgot / reset ; garde `safeRedirect(path)` exportée
- `src/lib/schemas/auth.ts` : `loginSchema`
- `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx` : starter réduit
- `src/app/oauth/consent/page.tsx` (Server Component : session, `getAuthorizationDetails`, journal `shown` / `auto`, rendu), `src/app/oauth/consent/actions.ts` (`approve`, `deny` : journal puis redirection), `src/app/oauth/consent/consent-form.tsx` (client : deux boutons, état pending)
- `src/app/auth-test/grants/page.tsx`, `actions.ts` (`revoke`, `logout`)
- `src/middleware.ts` : starter avec matcher réduit et redirection `redirect=` ; commentaire de tête : tout `/api/*` reste public par construction (mcp-patterns §6 bis)
- `tests/unit/auth-actions.test.ts` : `safeRedirect` (relatif accepté, `//evil`, `https://…`, vide → défaut) ; `loginSchema`
- `tests/unit/middleware.test.ts` : le matcher exclut les chemins listés
- `tests/integration/consent-page.test.tsx` : `@/lib/supabase/server` et `@/auth-test/journal` simulés (`vi.mock`) : sans session → redirection ; détails → client, scopes, boutons ; `redirect_url` → redirection ; erreur → message
- `tests/integration/grants-page.test.tsx` : liste, état vide

### Fichiers à modifier
- `docs/architecture.md` §10.5 si l'implémentation s'en écarte
- `.claude/conventions/component-registry.md` : Server Actions `login`, `logout`, `approve`, `deny`, `revoke` ; schéma `loginSchema`

### Patterns à suivre
- `auth-patterns.md` (login, middleware, sécurité), `nextjs-patterns.md` (Server Components, actions), `security-patterns.md` (redirection ouverte, secrets), CLAUDE.md §Règles Next.js (auth vérifiée dans chaque action, Zod partagé)
- `coding-standards.md` §Surfaces nouvelles ; `**Écarté :**` au changelog (lien magique écarté, mot de passe retenu pour le pilotage par navigateur)
- Interdit : `src/auth-test/mcp/`, `src/auth-test/token.ts`, `src/app/api/`, `src/app/.well-known/` (S02) ; `src/proto/`, `src/mcp/`

## Tests attendus

### Unit tests
- [ ] `auth-actions.test.ts` : `safeRedirect`, `loginSchema`
- [ ] `middleware.test.ts` : matcher

### Integration tests
- [ ] `consent-page.test.tsx` : quatre cas
- [ ] `grants-page.test.tsx` : liste et état vide

### E2E tests
- [ ] S04 : `/oauth/consent` répond sur l'hôte Acme déployé (redirection vers `/login`)

## Post-implémentation

Implémentée le 2026-09-23 par Opus (agent) ; review isolée : voir Notes.

### Écarts avec la référence UI
- Aucun écart signalé ; à vérifier au navigateur sur l'hôte Acme (S04) : marque « Acme », client (nom, logo, site), adresse de retour, scopes, compte, Autoriser / Refuser.

### Écarts avec l'architecture
- Consentement et clients autorisés dans le groupe `(auth)` pour partager son layout (URL inchangées) ; `src/lib/supabase/client.ts` non créé (aucun composant client ne parle à Supabase).
- `safeRedirect`, `loginPath`, `consentPath` dans `lib/schemas/auth.ts` (un fichier `"use server"` n'exporte que des fonctions async) ; la garde refuse aussi `\` et les blancs.
- `logout` unique dans `lib/actions/auth.ts`, `signOut({ scope: "local" })` : un `global` supprimerait toutes les sessions du compte, celles des assistants comprises.
- `revokeGrant({ clientId })` (objet, auth-js 2.116) ; `authorization_id` validé (`[A-Za-z0-9_-]`, ≤ 255) parce que le SDK l'insère tel quel dans une URL.
- Stage `auto` : Supabase ne rend que `redirect_url` ; la ligne porte `client: null`, `scope: null`, `redirect_uri` sans la query. Chaque ligne `consent` remplit aussi `client_id` et `client_name`.
- Middleware : `X-Frame-Options: DENY` sur ses trois chemins (clickjacking du bouton Autoriser).
- Noms d'actions sans suffixe `Action` (ceux de la story).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `login`, `logout` | `src/lib/actions/auth.ts` | Server Actions |
| `loginSchema`, `authorizationIdSchema`, `safeRedirect`, `loginPath`, `consentPath`, `DEFAULT_REDIRECT` | `src/lib/schemas/auth.ts` | |
| `LoginForm`, `ConsentForm`, `RevokeButton` | `src/app/(auth)/login/login-form.tsx`, `oauth/consent/consent-form.tsx`, `auth-test/grants/revoke-button.tsx` | composants client (pending, erreur inline) |
| `approve`, `deny` | `src/app/(auth)/oauth/consent/actions.ts` | relisent `getAuthorizationDetails` avant de journaliser |
| `revoke` | `src/app/(auth)/auth-test/grants/actions.ts` | `revokeGrant({ clientId })` + `revalidatePath` |
| `ScopeList` | `src/components/scope-list.tsx` | consentement et clients autorisés |
| `consent-journal.ts` | `src/app/(auth)/oauth/consent/consent-journal.ts` | lignes `consent` (`shown`, `approved`, `denied`, `auto`) |
| Pages et formulaires | `src/app/(auth)/login/`, `oauth/consent/`, `auth-test/grants/`, `src/middleware.ts`, `src/lib/supabase/server.ts` | |

### Option plus simple écartée
Journaliser Autoriser / Refuser sans relire `getAuthorizationDetails` : l'`authorization_id` n'étant jamais journalisé, rien ne relierait la ligne à son client ; renvoyer le client depuis le formulaire ferait journaliser ce que le navigateur renvoie. La décision coûte un appel de plus.

### Notes
- Checks verts (30 fichiers, 342 tests, dont 46 de S03). `pnpm build` lancé par le lot de corrections.
- Review isolée (2026-09-23) : 0 HAUTE, 3 MOYENNE, 14 BASSE ; traitées le jour même : `requestHost` partagé, middleware limité aux `GET` (un POST d'action sans session tombait sur la page d'erreur générique), tests du login en intégration avec l'erreur inline, constantes partagées, `approve` avec consentement déjà donné, `redirect` trop long ignoré, tests ajoutés, accessibilité, `clientIdSchema`, `revoke` rend `{ data }`. Non retenus : limite de tentatives, confirmation sur Révoquer, `h3` d'`EmptyState`. Remonté à JB : `--primary-dark` (#00b47c) donne ~2,7:1 sur blanc, sous l'AA (4,5:1) ; token global du design system, hors E03.
- Dette : pas de limite de tentatives sur `/login` (limites Supabase seulement, par IP de sortie Vercel, partagée) ; les échecs du consentement ne vont qu'aux logs Vercel ; `resource` n'est pas dans `getAuthorizationDetails` (la preuve 9 passe par `oauth_authorizations()` de S07) ; le test du matcher utilise `unstable_doesMiddlewareMatch` (API expérimentale de Next).
- À vérifier au navigateur (S04) : 307 vers `/login?redirect=…` sans session puis retour au consentement ; lignes `shown` puis `approved` au journal ; redirection `auto` côté client (le `loading.tsx` racine fait streamer la page) ; **preuve 7** : Supabase lie la demande au premier compte qui ouvre la page de consentement, donc se connecter comme l'alias sur `/login` avant de lancer la connexion depuis le host, sinon « invalide ou expirée » ; après « Déconnexion » (locale) les appels du host passent encore.
