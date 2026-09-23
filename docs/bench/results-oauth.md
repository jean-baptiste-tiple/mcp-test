# Résultats E03 — authentification des assistants (OAuth 2.1 avec Supabase)

> Rempli en suivant `docs/bench/protocol.md` §9. Chaque case porte la date (AAAA-MM-JJ), le `client_name@client_version` journalisé et la requête (`O1` à `O7`) ou la ligne de `oauth_test.journal` qui la produit. Une case vide = non mesuré. Le verdict va dans ADR-004 ; les changements proposés au doc technique, en dernière section. Aucun jeton, secret, mot de passe ni lien magique ici. Heures en UTC.

## Serveur et comptes

| Élément | Valeur | Depuis |
|---------|--------|--------|
| Hôte Acme | `https://mcp-test-acme.vercel.app/api/auth-test/mcp` (`acme_whoami`, `acme_echo`) | domaine rattaché à `e03-oauth` le 2026-09-23 |
| Hôte Delta | `https://mcp-test-e03-delta.vercel.app/api/auth-test/mcp` (`delta_whoami`, `delta_echo`) | idem (`mcp-test-delta.vercel.app` appartient à une autre équipe) |
| Serveur d'autorisation | `https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1` (enregistrement dynamique, PKCE S256, `offline_access`, JWKS ES256, jetons d'accès de 3 600 s) | relu le 2026-09-23 |
| Page de consentement | `/oauth/consent` sur l'adresse de site du projet Supabase : `https://mcp-test-navy.vercel.app` (production, `main` avancé à `8a11b60` le 2026-09-23 vers 16:15). Une seule adresse de site par projet : la page ne peut pas vivre sur l'hôte de l'organisation | 2026-09-23 |
| Comptes | JB (membre d'Acme et de Delta) ; alias `jean-baptiste+acme@tiple.io` (membre d'Acme seulement) | seed S01 |
| Protection Vercel | Vercel Authentication désactivée sur le projet le 2026-09-23 à 15:06 : en « Standard » comme en « préversions seulement », les domaines rattachés à la branche restaient protégés (mesuré) ; à remettre après la campagne | 2026-09-23 |

## Réglages faits (heure, qui, quoi)

| Date, heure | Qui | Réglage | Relu |
|-------------|-----|---------|------|
| 2026-09-23 | pilote | Vercel : domaines `mcp-test-acme.vercel.app` et `mcp-test-e03-delta.vercel.app` rattachés à `e03-oauth` ; variables Preview `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `BENCH_ACK_SECRET` (CLI, valeurs jamais affichées) | `vercel env ls preview` |
| 2026-09-23, 15:05–15:06 | pilote | Vercel : `ssoProtection` passé de `all_except_custom_domains` à `preview` (domaines toujours protégés) puis à `null` (désactivé) | curl : 401 de notre serveur, 200 sur les métadonnées |
| 2026-09-23, ~16:00 | JB | Supabase : adresse de site inchangée (`https://mcp-test-navy.vercel.app`, une seule par projet, refus motivé de la changer par organisation) ; URLs de redirection `https://*.mcp-test-navy.vercel.app*` ajoutées — sans effet : les clients enregistrés dynamiquement sont validés sur leur propre `redirect_uris`, pas sur cette liste | consentements servis sur `mcp-test-navy` |
| 2026-09-23, ~16:15 | pilote (accord JB) | `main` avancé à `8a11b60` (E03 fusionné) ; `NEXT_PUBLIC_SUPABASE_ANON_KEY` ajouté à Production (CLI) ; production redéployée : `/login`, `/oauth/consent`, `/auth-test/grants` servis sur l'adresse de site | `pnpm mcp:smoke` inchangé |
| 2026-09-23, 16:57 | pilote | Claude Code : `claude mcp add --transport http acme-auth …` et `delta-auth` (scope local, projet `C:\apps\mcp-test`) ; à retirer avec `claude mcp remove <nom> -s local` | `claude mcp list` |

## Smoke HTTP de la préversion (S04, 2026-09-23, 15:06, déploiement `e794fa7`)

| Contrôle | Acme | Delta |
|----------|------|-------|
| `POST /api/auth-test/mcp` sans jeton | 401, `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="https://mcp-test-acme.vercel.app/.well-known/oauth-protected-resource/api/auth-test/mcp"` | 401, `resource_metadata` de l'hôte Delta |
| `GET /.well-known/oauth-protected-resource/api/auth-test/mcp` | `resource` = `https://mcp-test-acme.vercel.app/api/auth-test/mcp`, `authorization_servers` = Supabase du banc, `scopes_supported` openid, email, profile, offline_access | idem avec l'hôte Delta |
| Racine `/.well-known/oauth-protected-resource` et variante `/api/auth-test/mcp/.well-known/oauth-protected-resource` | 200 | 200 |
| `GET /oauth/consent?authorization_id=x` sans session | 307 → `/login?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3Dx` | idem |
| `GET /api/auth-test/mcp` | 405 | 405 |
| Jeton réel (mot de passe) de JB, `acme_whoami` | membre d'Acme, `aud` authenticated, `client` none, `exp` +3 600 s, `amr` password | — |
| Jeton réel de l'alias, `delta_whoami` | — | `isError` : « You are signed in as jean-baptiste+acme@tiple.io but you are not a member of Delta Logistique. Ask an administrator of Delta Logistique to add you. » ; `tools/list` servi |
| Jeton réel de l'alias, `acme_whoami` | membre d'Acme | — |
| `https://mcp-test-navy.vercel.app/api/mcp` (`pnpm mcp:smoke`) | inchangé (4 tools, version 1.0.4) | |

Protection Vercel, mesurée sur ces domaines : en « Standard » (`all_except_custom_domains`) et en « préversions seulement » (`preview`), un domaine rattaché à une branche reste protégé (401 « Protected deployment » sur POST, 302 vers le SSO sur GET). Vercel Authentication désactivée sur le projet à 15:06 (`ssoProtection: null`, la production étant déjà publique) ; à remettre en `all_except_custom_domains` après la campagne.

## Empreintes des hosts (O1)

| Host | Modèle (tag `note`) | client_name@client_version | user_agent, IP | Date |
|------|---------------------|----------------------------|----------------|------|
| Claude Code (CC) 2.1.280 | non tagué | `claude-code@2.1.280` | découverte et santé (`claude mcp get`) : `claude-code/2.1.280 (claude-vscode, agent…)` ; appels `claude -p` : `claude-code/2.1.280 (sdk-cli, agent-sdk/0.3.280)` ; IP du poste | 2026-09-23 16:57–17:02 |
| claude.ai (CW) | non tagué | `Anthropic/Toolbox` puis `Anthropic/ClaudeAI` à la connexion (16:28), `claude-ai@0.1.0` au rafraîchissement (16:54) | découverte et jeton : `python-httpx/0.28.1` ; appels MCP : `Claude-User` ; IP 160.79.106.x | 2026-09-23 16:27–16:54 |
| ChatGPT (GPT) | non tagué | `openai-mcp/1.0.0` | sonde de découverte : `Python/3.14 aiohttp` ; appels MCP : `openai-mcp/1.0.0` ; échange de jeton : `openai-connectors-oauth/1.0` ; IP 74.161.200.x | 2026-09-23 16:38–16:53 |
| Claude Desktop (CD) | | | non mesuré | |
| Claude mobile / ChatGPT mobile | | | non mesuré | |

Particularité CC : une session Claude Code connectée à claude.ai charge aussi les connecteurs claude.ai de l'utilisateur ; le serveur Acme a vu, dans le même `claude -p` (17:01:12), un `initialize` `claude-code@2.1.280` **via le proxy Anthropic** (`Claude-User`, jeton du client « Claude » de claude.ai, session `ec8f6350`) à côté de l'`initialize` direct du client « Claude Code (acme-auth) ». Un même utilisateur sur un même poste = deux clients OAuth pour un même serveur.

## Preuves sans host (Vitest)

| # | Preuve | Test | Résultat | Date |
|---|--------|------|----------|------|
| 1 | Sans jeton, jeton invalide, expiré ou d'une autre clé : 401, `WWW-Authenticate` vers les métadonnées du bon hôte | `tests/unit/auth-test-route.test.ts` | ✅ 27 tests (absent, autre clé, expiré, autre `iss`, illisible, sans `sub`, JWKS en panne ; par hôte) | 2026-09-23 |
| 2 | Chaque hôte publie sa propre ressource (racine et variante suffixée) | `tests/unit/auth-test-metadata.test.ts` | ✅ 11 tests ; confirmé en HTTP sur la préversion | 2026-09-23 |
| 3 | Membre : whoami rend la bonne organisation et le bon préfixe ; non-membre : refus nommant l'organisation, sans donnée | `tests/integration/auth-test-server.test.ts` | ✅ jeton réel vérifié par la JWKS du projet ; confirmé en HTTP (JB sur Acme, alias refusé sur Delta) | 2026-09-23 |
| 4 | Membre retiré : appel suivant refusé, même jeton | `tests/integration/auth-test-server.test.ts` | ✅ retrait puis refus, ajout puis accepté, sans cache | 2026-09-23 |
| 4 bis | RLS : le jeton d'un utilisateur ne lit que ses appartenances | `tests/integration/auth-test-schema.test.ts` | ✅ ses lignes seulement ; insert, delete et journal refusés ; anonyme refusé dès le schéma (42501) | 2026-09-23 |

## Matrice host × preuve (5 à 11)

Case = résultat en une ligne · date · client · requête. « Échec » = le point exact et le message du host. Toutes les dates : 2026-09-23.

| # | Preuve | CC | CW | GPT | CD | Mobiles |
|---|--------|----|----|-----|----|---------|
| 5 | Parcours complet : découverte (forme d'URL des métadonnées lue), enregistrement dynamique, connexion, consentement, outils listés, appel réussi | ✅ 16:57–17:02 (alias) · `claude mcp add` : `server/discover` sans jeton → 401 → `GET /.well-known/oauth-protected-resource/api/auth-test/mcp` (forme suffixée) · `claude mcp login` : client public « Claude Code (acme-auth) », consentement, `initialize` + `tools/list` · `claude -p` : `acme_whoami` membre d'Acme, texte collé tel quel | ✅ 16:27–16:29 (JB) · POST `initialize` → 401 → métadonnées suffixées (`python-httpx`) · client confidentiel « Claude » · consentement · `server/discover` (400) + `initialize` + `tools/list` · conversation `e85f23a5…` : `acme_whoami` collé tel quel | ✅ 16:38–16:40 (JB) · sonde `aiohttp` → 401 → métadonnées · panneau OAuth avancé (DCR détecté, CIMD « indisponible », endpoints, Resource, OIDC userinfo) · client public « ChatGPT » · consentement dans un onglet · liste d'outils vide jusqu'à « Actualiser » · chat `6ab40124…` (`@Acme Auth`) : `acme_whoami` | non mesuré | non mesuré |
| 6 | Acme et Delta côte à côte : deux enregistrements, chaque whoami sa propre organisation, aucun mélange ; même jeton présenté aux deux hôtes ? | ✅ 17:02 · deux clients (`e644e255` Acme, `cd8ec3a5` Delta), deux sessions (`58d92d10`, `d8f95f09`), chaque hôte son jeton · `acme_whoami` Acme (alias membre), `delta_whoami` refusé (alias non membre) : aucun mélange | ✅ 16:33 · conversation `cc683fbe…` : deux clients (`f7f20a2f`, `de6f9c22`), deux sessions (`ec8f6350`, `38218d35`), chaque whoami sa propre organisation · jamais le même jeton sur les deux hôtes | ✅ 16:43:55 · chat `6ab401c5…` : deux clients (`3358a18a`, `cf4637c7`), deux sessions (`c7cf3a64`, `1454f71c`), chaque whoami sa propre organisation · jamais le même jeton | | |
| 7 | Second utilisateur sur Delta : connexion et consentement passent, `tools/list` servi, appels refusés avec un message clair ; ce que l'host montre | ✅ 17:00–17:01 · alias : consentement approuvé, `initialize` + `tools/list` servis, `delta_whoami` → `denied_not_member` · Claude Code (`-p`) : « L'appel a échoué, voici le texte d'erreur exact : » puis le message serveur intégral | non joué : campagne coupée par JB à 17:20 (déjà prouvé sur CC et GPT ; le serveur est le même) | ✅ 16:50–16:53 · « Connecter un autre compte » sur la fiche Delta Auth : consentement de l'alias (scopes openid, email, offline_access — sans `profile`), deux comptes listés (JB « Primary », alias), aucun appel serveur à la connexion · appel ordinaire `@Delta Auth` = compte principal (JB, autorisé) · sur demande explicite « avec le second compte », le modèle appelle avec l'alias : refus, message serveur affiché tel quel | | |
| 8a | Jeton court : l'host rafraîchit seul (401 puis nouvel `exp` au journal) ? | non mesuré (jetons émis à 17:00–17:02, `exp` 18:00–18:02 ; hors fenêtre) | non mesuré (coupé à 17:20, `exp` 17:29:03) | non mesuré (coupé, `exp` 17:43:17) | | |
| 8b | Refresh token révoqué (grants, puis sessions) : comportement de l'host | non mesuré (même raison) | partiel : grant Delta révoqué à 16:34:51 (consentement `revoked_at`, session `38218d35` supprimée) ; `delta_whoami` **encore autorisé** à 16:35:47 ; claude.ai affiche toujours « Connecté » à 17:08 ; comportement après `exp` (17:32:32) non mesuré (coupé) | partiel : grant Acme révoqué à 16:48:14 via `/auth-test/grants` ; comportement après `exp` (17:39:52) non mesuré (coupé) | | |
| 9 | Relevé : nom du client, adresse de retour, scopes, `aud`, `client_id`, `resource` ; ce que la page de consentement a vu | ✅ voir tableau ci-dessous | ✅ idem | ✅ idem | | |
| 10 | Reconnexion : métadonnées, `initialize`, `tools/list` relus ou non, par geste | ✅ chaque `claude -p` et chaque `claude mcp get` = `server/discover` + `initialize` + `initialized` + `tools/list` par serveur, même jeton, sans relire les métadonnées (17:00:32, 17:01:11, 17:02:11, 17:02:15) | ✅ « Actualiser la liste d'outils » (16:54:03) : toast « Liste d'outils actualisée. », `server/discover` + `initialize` (`claude-ai@0.1.0`) + `initialized` + `tools/list`, même jeton, métadonnées non relues · nouvelle conversation (16:35) : `server/discover` + `initialized` + `tools/call` **sans** `tools/list` · déconnexion/reconnexion : non joué (coupé) | ✅ « Actualiser » (16:40) : rejoue la sonde de découverte puis `initialize` + `tools/list` avec le même jeton (« Outils actualisés ») · nouvelle conversation (16:52:15) : `initialize` puis `tools/call`, sans `tools/list` | | |
| 11 | Apps mobiles : parcours complet oui / non, point d'échec | — | non mesuré | non mesuré | — | non mesuré |

## Relevés par host (preuve 9)

| Host | Nom du client enregistré | Type, auth. `/token` | Adresse de retour | Scopes demandés | `aud` | `client_id` présent | `resource` | Consentement : ce que la page a vu | Date |
|------|--------------------------|----------------------|-------------------|-----------------|-------|---------------------|------------|-------------------------------------|------|
| CC | `Claude Code (<nom du serveur>)`, un client par serveur | public, `none` | `http://localhost:<port aléatoire>/callback` (41654, 44189) | openid email profile offline_access ; `prompt=consent` ; PKCE S256 | `authenticated` | oui (`client_id` = id DCR) | envoyé : URL du serveur MCP ; **absent du jeton** (`aud` reste `authenticated`) | nom du client, compte, adresse de retour `localhost`, 4 scopes | 2026-09-23 16:59–17:02 |
| CW | `Claude`, un client par connecteur | confidentiel, `client_secret_post` | `https://claude.ai/api/mcp/auth_callback` | openid email profile offline_access ; PKCE S256 | `authenticated` | oui | envoyé (`https://mcp-test-e03-delta.vercel.app/api/auth-test/mcp` capturé en attente) ; absent du jeton | nom « Claude », compte, adresse de retour, 4 scopes ; la page porte la marque « Banc MCP », pas celle de l'organisation | 2026-09-23 16:28–16:32 |
| GPT | `ChatGPT`, un client par connecteur | public, `none` | `https://chatgpt.com/connector/oauth/<id du connecteur>` | openid email offline_access profile (1re connexion) ; openid email offline_access (« Connecter un autre compte ») ; PKCE S256 | `authenticated` | oui | envoyé pour les deux hôtes ; absent du jeton | nom « ChatGPT », compte, adresse de retour, scopes | 2026-09-23 16:38–16:50 |
| CD | | | | | | | | non mesuré | |

Clients enregistrés relevés par `pnpm oauth:admin clients` (2026-09-23, 17:02) : six clients dynamiques, jamais supprimés par les hosts — `Claude Code (acme-auth)` `e644e255`, `Claude Code (delta-auth)` `cd8ec3a5`, `ChatGPT` `cf4637c7` et `3358a18a`, `Claude` `de6f9c22` et `f7f20a2f`. Sessions (`pnpm oauth:admin sessions`) : une par client et par compte ; une ligne `auth.refresh_tokens` par session avant tout rafraîchissement.

## Frictions (P15 adapté)

| Date | Host | Friction observée | Cause supposée | Action |
|------|------|-------------------|----------------|--------|
| 2026-09-23 16:40 | GPT | En recopiant le résultat de `acme_whoami`, le modèle a altéré l'identifiant du client (`3358a18-…` au lieu de `3358a18a-…`) | recopie par le modèle d'un UUID long | ne jamais faire recopier un identifiant : le mettre dans `structuredContent`, ou le tronquer côté serveur |
| 2026-09-23 16:40 | GPT | Après le consentement, la fiche du plugin liste « Comptes connectés » mais aucun outil tant que « Actualiser » n'est pas cliqué | ChatGPT ne rejoue pas `tools/list` après l'OAuth | documenter le geste dans le mode d'emploi |
| 2026-09-23 16:50–16:53 | GPT | Second compte : l'appel ordinaire part avec le compte « Primary » sans le dire ; aucun réglage pour changer le compte principal (menu : Paramètres, Reconnecter, Déconnecter) ; le modèle choisit l'autre compte seulement sur demande explicite | modèle multi-comptes de ChatGPT | pour un produit multi-organisations : un serveur par organisation reste la seule séparation nette ; ne pas compter sur le choix de compte |
| 2026-09-23 16:35 | CW | Grant révoqué côté serveur (`/auth-test/grants`) : l'appel suivant passe encore | jeton d'accès valable jusqu'à `exp` (1 h), vérifié par JWKS sans aller-retour | coupure effective au rafraîchissement seulement ; JWT court (≤ 10 min) ou liste de révocation côté serveur si la coupure immédiate est exigée |
| 2026-09-23 16:57 | CC | `claude mcp login` exige un stdin TTY, même avec `--no-browser` (« stdin isn't a terminal ») | garde de la CLI | automatisé ici par un pseudo-terminal (`node-pty`) ; pour JB, terminal interactif |
| 2026-09-23 17:01 | CC + CW | Une session Claude Code connectée à claude.ai charge aussi les connecteurs claude.ai : un même serveur voit deux clients (direct et via le proxy Anthropic) pour le même utilisateur | synchronisation des connecteurs claude.ai dans Claude Code | le journal doit distinguer client et user agent ; ne pas déduire « un utilisateur = un client » |
| 2026-09-23 | serveur | `server/discover` (envoyé par les trois hosts) reçoit 400 de mcp-handler et sort au journal comme `denied_not_member http_400` | méthode inconnue traitée comme un refus par le journal | étiquette à corriger (`unknown_method`) ; dette S02 |
| 2026-09-23 | Supabase | Une seule adresse de site par projet : la page de consentement ne peut pas être servie sur l'hôte de l'organisation, donc pas de marque par organisation à ce point du parcours | contrainte Supabase | consentement sur le domaine commun (`app.oto.cx`), marque « plateforme » ; l'organisation apparaît dans le nom du client ou le texte de la page |
| 2026-09-23 15:05 | Vercel | Domaines de branche protégés en « Standard » et en « préversions seulement » | protection appliquée à tout déploiement non-production | protection désactivée pendant la campagne, à remettre |

## Verdict

Détail dans `docs/decisions/ADR-004-auth-assistants-supabase-oauth.md` §Verdict. En trois lignes :

1. **Supabase suffit, aucune façade.** Les trois hosts s'enregistrent seuls (Claude : client confidentiel ; ChatGPT et Claude Code : clients publics), suivent le 401 et les métadonnées de l'hôte appelé, consentent, appellent, et tiennent deux organisations côte à côte sans jamais présenter le jeton d'un hôte à l'autre ; un non-membre se connecte mais est refusé à l'appel, avec le message du serveur affiché tel quel par les trois hosts.
2. **Trois points de l'hypothèse à corriger, pas à abandonner.** La page de consentement ne connaît pas l'adresse d'origine (elle connaît le client et `resource`) ; les jetons ne portent pas la ressource (`aud` = `authenticated`) et sont interchangeables entre hôtes d'un même projet, l'appartenance compensant ; révoquer un assistant ne coupe qu'au rafraîchissement (jeton valable jusqu'à `exp`).
3. **Non mesuré** (campagne coupée à 17:20 sur demande de JB) : le rafraîchissement silencieux et la réaction d'un host à un refresh token révoqué après `exp`. Côté serveur, le fait est établi par les tests S07 : refresh refusé (`refresh_token_not_found`), jeton accepté jusqu'à `exp`.

## Changements proposés à la section « Connexion et identité » du doc technique

Texte actuel relu le 2026-09-23 sur la copie publiée du doc (le doc Claude n'est pas modifié).

| Passage visé | Texte actuel | Texte proposé | Mesure qui le justifie |
|--------------|--------------|---------------|------------------------|
| Tableau « Qui / Comment », ligne « Utilisateur, dans Claude ou ChatGPT », colonne Comment | « OAuth 2.1, Supabase en serveur d'autorisation : l'host lit `/.well-known/oauth-protected-resource`, s'enregistre seul, ouvre la page de connexion puis celle de consentement » | « OAuth 2.1, Supabase en serveur d'autorisation. Sur un 401 portant `WWW-Authenticate`, l'host lit `/.well-known/oauth-protected-resource/api/mcp` (la forme suffixée du chemin), s'enregistre seul — Claude en client confidentiel, ChatGPT et Claude Code en clients publics, un client par connecteur et par organisation —, ouvre la page de connexion puis celle de consentement, puis rejoue `initialize` et `tools/list`. Claude Code : `claude mcp add` puis `claude mcp login`, adresse de retour `localhost` ; une session Claude Code connectée à claude.ai reçoit aussi les connecteurs de claude.ai. » | Preuve 5 sur les trois hosts ; empreintes O1 ; `pnpm oauth:admin clients` |
| Même ligne, colonne À savoir | « Même compte que les écrans ; le jeton est vérifié à chaque appel » | « Même compte que les écrans ; le jeton est vérifié à chaque appel. ChatGPT n'affiche les outils qu'après « Actualiser » sur la fiche du connecteur, et peut connecter plusieurs comptes au même connecteur : il appelle avec le compte principal sauf demande explicite. » | Preuve 5 GPT (16:40) ; preuve 7 GPT (16:50–16:53) |
| Puce « L'organisation vient de l'adresse appelée » | « … Un consultant membre de plusieurs organisations garde un seul compte. » | Ajouter : « Chez l'host, chaque organisation est un connecteur distinct : un client OAuth, une session et un jeton par organisation. Le consultant connecte chaque organisation séparément, avec le même compte. » | Preuve 6 sur les trois hosts : deux clients, deux sessions, jamais le même jeton sur les deux hôtes |
| Puce « L'appartenance est revérifiée à chaque appel » | « Retirer quelqu'un coupe son accès dès l'appel suivant, même avec un jeton encore valide. » | Ajouter : « Révoquer un assistant (consentement ou session) ne coupe pas le jeton en cours : il reste accepté jusqu'à son expiration, 3 600 s par défaut ; la coupure se voit au rafraîchissement suivant. Retirer le membre est le geste de coupure immédiate ; une durée de jeton plus courte (réglage du projet) réduit la fenêtre. » | Preuve 8b CW : grant révoqué à 16:34:51, `delta_whoami` encore autorisé à 16:35:47 ; tests S07 (`refreshSession` refusé, jeton accepté jusqu'à `exp`) |
| Puce « En cellule partagée » | « … elle vit sur un domaine commun, habillée à la marque du client selon l'adresse d'origine. Par défaut, les jetons ne sont pas liés à un sous-domaine ; la vérification d'appartenance compense. » | « … elle vit sur un domaine commun (`app.oto.cx`). Elle ne connaît pas l'adresse d'origine : la demande d'autorisation ne porte que le client (`client_name` choisi par l'host : « Claude », « ChatGPT », « Claude Code (nom) ») et la ressource demandée (`resource`, envoyée par les trois hosts, lisible dans `auth.oauth_authorizations` pendant l'attente) ; c'est `resource` qui dit pour quelle organisation on consent et qui habille la page. Les jetons ne sont liés ni au sous-domaine ni à la ressource (`aud` = `authenticated`, `resource` absent du jeton) : un jeton émis pour un hôte est accepté par un autre hôte du même projet ; la vérification d'appartenance compense, et aucun host n'a présenté le jeton d'un hôte à un autre. » | Preuve 9 : `resource` capturé en attente pour les trois hosts, `aud` `authenticated` sur tous les jetons ; adresse de site unique refusée par JB (contrainte de la cible) |
| Puce « À valider avant de construire » | « … la connexion des assistants sur claude.ai et ChatGPT, story E03 du banc. Le projet Supabase Cloud du banc publie déjà son point d'enregistrement dynamique. » | « Validé le 2026-09-23 (E03 du banc) sur Claude Code 2.1.280, claude.ai et ChatGPT : enregistrement dynamique, consentement, appels, deux organisations côte à côte, second utilisateur refusé à l'appel, rafraîchissement et révocation (voir `docs/bench/results-oauth.md`). Aucune façade. » | Matrice 5 à 10 |
| Tableau « Points ouverts », ligne « Connexion des assistants » | « Serveur OAuth 2.1 de Supabase, avec enregistrement dynamique — La story E03 du banc, sur claude.ai et ChatGPT » | « Tranché le 2026-09-23 : Supabase suffit. Restent la durée des jetons (3 600 s : coupure différée d'autant) et le ménage de `auth.oauth_clients`, que les hosts ne purgent jamais (un client par connecteur, par organisation et par poste Claude Code). » | Verdict ; `pnpm oauth:admin clients` : six clients après une campagne |
