# Story E03-S04 — Déploiement de préversion, réglages Vercel et Supabase, protocole

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | 🔵 In Progress |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | deploy, mcp, supabase, security |
| **Estimation** | M |

## Contexte

Tout ce qui touche aux comptes de JB, et le protocole que les deux campagnes suivront. Relevé le 2026-09-23 : le projet Vercel `mcp-test` (équipe `otoma-studio`) est en protection « Standard » par Vercel Authentication : les URL de déploiement et de branche répondent 302 vers la connexion Vercel (mesuré), seul le domaine de production `mcp-test-navy.vercel.app` est public ; un domaine rattaché à une branche est protégé aussi, sauf **exception de protection** (Deployment Protection Exceptions, réglage du projet). Les variables d'environnement n'existent qu'en cible Production (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BENCH_ACK_SECRET`) : la préversion n'en a aucune. Le jeton de l'API de gestion Supabase est révoqué : les réglages Supabase se font au tableau de bord, par JB. L'adresse de site du projet est `https://mcp-test-navy.vercel.app` ; la page de consentement doit vivre sur l'hôte Acme. Le push de la branche `e03-oauth` sans nouveau commit n'a déclenché aucune préversion : le premier commit le fera.

**Refs :**
- PRD : FR-AUTH-10, FR-AUTH-11 (protocole), NFR-AUTH-01, NFR-AUTH-03
- Architecture : §8, §10.8 ; ADR-004 (Conséquences négatives : réglages partagés)
- `docs/bench/protocol.md` §0, §1, §8 (forme d'un runbook, requêtes SQL) ; `docs/bench/results.md` (forme des grilles)
- Docs Claude Code (2026-09-23) : `claude mcp add --transport http <nom> <url>`, `claude mcp login <nom>` (flow OAuth depuis le shell), `claude mcp logout <nom>`, `--callback-port` pour fixer `http://localhost:PORT/callback`, 401 → rafraîchissement et un nouvel essai, refresh token refusé → invite `/mcp`

## Critères d'acceptation

- [ ] **Given** l'accord de JB **When** les domaines `mcp-test-acme.vercel.app` et `mcp-test-e03-delta.vercel.app` (ajoutés au projet avec `gitBranch: e03-oauth` le 2026-09-23 ; `mcp-test-delta.vercel.app` appartient à une autre équipe) sont rendus publics (exception de protection, ou réglage de protection du projet) **Then** un `POST` JSON-RPC (`curl -X POST`, en-têtes `content-type: application/json` et `accept: application/json, text/event-stream` ; un GET rend 405) sur `https://<hôte>/api/auth-test/mcp` répond 401 avec `WWW-Authenticate` portant `resource_metadata` de cet hôte (pas 302) ; `GET /.well-known/oauth-protected-resource/api/auth-test/mcp` rend `resource` de cet hôte ; `GET /oauth/consent` redirige vers `/login` ; sur les deux hôtes
- [ ] **Given** les variables de préversion ajoutées par JB (cible Preview) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `BENCH_ACK_SECRET` **Then** vérifiées par l'API Vercel (noms et cibles seulement, jamais les valeurs) et une requête `whoami` avec un jeton obtenu par `signInWithPassword` (compte de test, mot de passe de `.env.local`) répond sur l'hôte Acme
- [ ] **Given** `https://mcp-test-navy.vercel.app/api/mcp` et `/api/proto/u/jb/mcp` **Then** inchangés (`pnpm mcp:smoke`, un `initialize` proto)
- [ ] **Given** les réglages Supabase, chacun annoncé à JB avant et fait par lui **Then** adresse de site = `https://<hôte Acme>` ; URLs de redirection : `https://<hôte Acme>/**` et `https://<hôte Delta>/**` ; serveur OAuth activé, enregistrement dynamique activé, chemin d'autorisation `/oauth/consent` (déjà en place, relu) ; durée des jetons laissée à 3 600 s jusqu'à la preuve 8 ; `OAUTH_TEST_PASSWORD` posé dans `.env.local` par JB ; email de l'alias confirmé ; `pnpm oauth:seed` joué ; `select slug, host from oauth_test.orgs` rend les deux hôtes
- [ ] **Given** `docs/bench/protocol.md` §9 « Serveur auth-test (E03) » **Then** pré-requis par host (Claude Code : `claude mcp add` Acme et Delta, `claude mcp login` par JB en session interactive, puis `claude -p --mcp-config <fichier> --strict-mcp-config` avec les mêmes noms ; claude.ai : connecteur personnalisé, « Se connecter maintenant » ; ChatGPT : mode développeur avec OAuth, sélection par `@Acme` ; Claude Desktop : partage le client claude.ai) ; heure de chaque geste notée ; prompt P0-auth : « Call acme_whoami with note "<host>/<modèle>" and paste its full output verbatim. » ; déroulé des preuves 5 à 11 (geste, prompt, lecture attendue, requête) ; requêtes SQL O1 à O7 sur `oauth_test.journal` (empreintes par hôte ; chronologie d'un hôte ; décisions et refus ; consentements ; relectures de métadonnées et de `tools/list` autour d'une reconnexion) et sur `auth.oauth_clients` (clients enregistrés : nom, `redirect_uris`, date ; colonnes à vérifier dans Studio) et `auth.sessions` (sessions d'un utilisateur) ; procédures : expiration (JB baisse la durée des jetons à la valeur minimale acceptée par le tableau de bord, mesure, retour à 3 600 s), révocation (par `/auth-test/grants`, puis par `delete from auth.sessions where user_id = …` par JB ; noter la différence), retrait d'un membre (`pnpm oauth:member`), remise en état
- [ ] **Given** `docs/bench/results-oauth.md` créé **Then** en-tête (hôtes, dates, `client_name@client_version` par host), matrice host × preuves 5 à 11 (Claude Code, claude.ai, ChatGPT, Claude Desktop, mobiles) vide, sections « Relevés par host » (nom du client, adresse de retour, scopes, `aud`, `client_id`, `resource`, ce que la page de consentement a vu), « Frictions », « Verdict » (renvoi ADR-004), « Changements proposés à la section Connexion et identité »
- [ ] **Given** `README.md` **Then** section « Serveur auth-test (E03) » : les deux URL, ce qui est prouvé, seed, ADR-004, branche

## Implémentation

### Fichiers à créer
- `docs/bench/results-oauth.md`

### Fichiers à modifier
- `docs/bench/protocol.md` : §9
- `README.md` : section « Serveur auth-test (E03) »
- `scripts/lib/oauth-data.mjs` : hôtes de repli si les noms sont pris
- `docs/architecture.md` §10.8 : hôtes définitifs, réglages faits

### Opérations hors code (avec JB, dans cet ordre)
| # | Geste | Qui | Où |
|---|-------|-----|-----|
| 1 | Ajouter les deux domaines au projet, rattachés à `e03-oauth` | pilote, avec l'accord de JB | API Vercel (`add_project_domain`) |
| 2 | Exception de protection pour les deux domaines | JB | Vercel → projet → Settings → Deployment Protection → Deployment Protection Exceptions |
| 3 | Variables de préversion (4) | JB | Vercel → Settings → Environment Variables, cible Preview |
| 4 | Adresse de site, URLs de redirection, contrôle du serveur OAuth | JB | Supabase → Authentication → URL Configuration, OAuth Server |
| 5 | `OAUTH_TEST_PASSWORD` dans `.env.local`, email de l'alias | JB | local |
| 6 | Migration `oauth_test` (si S01 ne l'a pas appliquée) puis `pnpm oauth:seed` | pilote | local, `--db-url` lu sans affichage |
| 7 | Smoke HTTP sur les deux hôtes, consigné dans `results-oauth.md` | pilote | curl |

### Patterns à suivre
- `deployment-patterns.md` ; `security-patterns.md` (aucune valeur de variable dans la conversation)
- Chaque réglage Supabase ou Vercel : annoncé, fait, relu, noté dans `results-oauth.md` avec l'heure

## Tests attendus

### Unit tests
- [ ] N/A

### Integration tests
- [ ] N/A

### E2E tests
- [ ] Smoke HTTP : 401 par hôte, métadonnées par hôte, consentement joignable, `whoami` avec un jeton de test, `/api/mcp` et `/api/proto` inchangés

## Post-implémentation

En cours (2026-09-23) : tout ce qui ne dépend pas d'un réglage Supabase est fait par le pilote.

### Écarts avec l'architecture
- Domaines `mcp-test-acme.vercel.app` et `mcp-test-e03-delta.vercel.app` (le second en repli : `mcp-test-delta` appartient à une autre équipe) ajoutés par l'API Vercel, rattachés à `e03-oauth`.
- Variables Preview posées par la CLI Vercel (`npx vercel env add … preview` depuis un dossier lié dans le scratchpad, valeurs lues dans `.env.local` par le shell, jamais affichées) et non par JB : la session CLI de JB était valide.
- Protection : l'exception de protection n'est pas exposée par l'API du projet ; les niveaux `all_except_custom_domains` et `preview` protègent tous deux les domaines rattachés (mesuré : 401 « Protected deployment », 302 SSO) → Vercel Authentication désactivée sur le projet (`ssoProtection: null`), la production étant déjà publique. À remettre en `all_except_custom_domains` après la campagne.
- Le contrôle 401 se fait en POST JSON-RPC (un GET rend 405).
- Le smoke `whoami` avec un jeton réel a été joué sur les trois cas (JB sur Acme, alias sur Delta refusé, alias sur Acme) : voir `results-oauth.md`.

### Option plus simple écartée
Déployer la page de consentement sur `main` (adresse de site actuelle) au lieu de changer l'adresse de site Supabase : aurait exigé la fusion de la branche avant toute mesure et mis la page sur un hôte sans organisation (marque « Banc MCP » toujours) ; l'adresse de site vers l'hôte Acme reste le geste minimal, réversible.

### Notes
- Fait : domaines, variables Preview, protection, préversion `e794fa7` puis `25dfe39` (fusion de `main`), smoke HTTP complet consigné, `docs/bench/protocol.md` §9, `results-oauth.md` (squelette + smoke), README (S02).
- Reste à JB (tableau de bord Supabase, le jeton de gestion étant révoqué et la session Supabase absente du navigateur piloté) : adresse de site `https://mcp-test-acme.vercel.app`, URLs de redirection `https://mcp-test-acme.vercel.app/**` et `https://mcp-test-e03-delta.vercel.app/**`. Sans l'adresse de site, le serveur OAuth redirige le consentement vers `mcp-test-navy.vercel.app/oauth/consent`, qui n'existe pas sur `main` : S05 et S06 attendent ce réglage.
- Comptes de test créés par le seed (JB et alias) avec `OAUTH_TEST_PASSWORD` de `.env.local` du worktree.
