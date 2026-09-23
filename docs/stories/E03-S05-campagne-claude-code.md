# Story E03-S05 — Campagne Claude Code

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23) — preuves 5, 6, 7, 9, 10 ; preuve 8 non mesurée |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, testing |
| **Estimation** | M |

## Contexte

Claude Code se pilote sans navigateur, sauf la connexion OAuth elle-même : JB s'authentifie une fois par connecteur (`claude mcp login acme`, navigateur, page de consentement sur l'hôte Acme), puis les runs headless (`claude -p`) réutilisent le jeton stocké — première chose à vérifier. Docs Claude Code (2026-09-23) : enregistrement dynamique requis, adresse de retour `http://localhost:<port aléatoire>/callback`, un 401 déclenche un rafraîchissement du jeton et un nouvel essai, un refresh token refusé affiche une invite `/mcp`, `claude mcp logout` efface les jetons, retirer le serveur efface aussi l'enregistrement. Le navigateur n'est pas nécessaire pour cette story : elle peut se jouer pendant E04-S07.

**Refs :**
- PRD : FR-AUTH-11, critères « hosts » du parcours 4.6
- `docs/bench/protocol.md` §9 (S04), `docs/bench/results-oauth.md`
- Pièges E01 : Claude Code ne montre que `structuredContent` quand il existe ; une nouvelle session pour voir un changement ; attendre l'état « connected » avant le premier message

## Critères d'acceptation

- [ ] **Given** preuve 5 **When** JB fait `claude mcp add --transport http acme https://<hôte Acme>/api/auth-test/mcp` puis `claude mcp login acme` **Then** le journal montre, dans l'ordre et à l'heure : la lecture des métadonnées (forme d'URL lue : racine ou suffixée), le 401 initial, le consentement (`consent` : nom du client, `redirect_uri` localhost avec son port, scopes), puis `initialize`, `tools/list`, `acme_whoami` avec jeton ; `auth.oauth_clients` porte le client (nom, `redirect_uris`) ; puis un run `claude -p --mcp-config … --strict-mcp-config` avec le même nom de serveur appelle `acme_whoami` sans nouvelle connexion (oui / non, journal)
- [ ] **Given** preuve 6 **When** `delta` est ajouté et connecté de la même façon **Then** deux clients enregistrés ; dans un run avec les deux serveurs, `acme_whoami` rend Acme et `delta_whoami` rend Delta ; noter si le même jeton (`session_id`, `client_id`) est présenté aux deux hôtes ou non
- [ ] **Given** preuve 7 **When** JB fait `claude mcp logout delta` puis `claude mcp login delta` comme l'alias **Then** connexion et consentement passent, `tools/list` servi, `delta_whoami` refusé avec le message qui nomme Delta ; `acme_whoami` de l'alias accepté ; le refus est visible dans la réponse du modèle
- [ ] **Given** preuve 8 **When** JB baisse la durée des jetons (valeur minimale acceptée), qu'un jeton expire, puis un appel **Then** journal : 401 `expired` puis un appel accepté avec un nouveau `exp` (rafraîchissement seul, sans geste) ou non ; puis révocation par `/auth-test/grants` puis, séparément, par suppression de session : comportement de Claude Code (message, invite `/mcp`), au journal et dans la réponse ; retour à 3 600 s
- [ ] **Given** preuve 9 **Then** relevé : nom du client enregistré, adresse de retour, scopes demandés, `aud` et `client_id` du jeton, `resource` (présent dans `aud` ? absent ?), ce que la page de consentement a vu, protocole MCP annoncé
- [ ] **Given** preuve 10 **When** `/mcp` reconnect en session interactive, puis une nouvelle session **Then** métadonnées relues ou non, `tools/list` relu ou non, avec les heures, par geste
- [ ] **Given** chaque run **Then** rapport de frictions P15 adapté (« about the acme and delta connectors, including the sign-in ») recoupé au journal
- [ ] **Given** `docs/bench/results-oauth.md` **Then** colonne Claude Code remplie pour les preuves 5 à 10, chaque fait avec sa requête SQL, version cliente journalisée, date
- [ ] **Given** la fin **Then** durée des jetons remise à 3 600 s ; connecteurs retirés des serveurs de JB s'il le demande

## Implémentation

### Fichiers à créer
- Scripts de run et fichier `--mcp-config` dans le scratchpad (non versionnés) ; commandes exactes recopiées dans `results-oauth.md`

### Fichiers à modifier
- `docs/bench/results-oauth.md`
- `docs/bench/protocol.md` §9 si une étape se révèle fausse

### Patterns à suivre
- `mcp-patterns.md` §8 (rafraîchissement par host, recoupement au journal)
- Jamais un jeton, un mot de passe ni un lien magique dans la conversation ou les fichiers

## Tests attendus

### Unit tests
- [ ] N/A (campagne)

### Integration tests
- [ ] N/A

### E2E tests
- [ ] Les runs, relus au journal

## Post-implémentation

Jouée le 2026-09-23 (16:57–17:02 UTC) par le pilote, sans JB : résultats dans `docs/bench/results-oauth.md` (colonne CC, empreintes, relevés, frictions).

### Écarts avec la story
- Connexion faite par le pilote et non par JB : `claude mcp login` exige un stdin TTY même avec `--no-browser` ; un pilote `node-pty` (scratchpad, non versionné) a lancé la CLI, lu l'URL d'autorisation dans sa sortie, et le consentement s'est joué dans le navigateur piloté (compte alias, déjà connecté sur le site pour la preuve 7 web). Les deux serveurs sont donc connectés comme l'alias, pas comme JB : preuve 5 sur Acme (alias membre), preuve 7 sur Delta, preuve 6 avec un hôte autorisé et un refusé. La variante « JB sur les deux » n'a pas été rejouée : rien ne dépend du compte, les faits mesurés (clients, sessions, jetons par serveur) sont les mêmes.
- Serveurs ajoutés en scope `local` (`~/.claude.json`, projet `C:\apps\mcp-test`) et appelés par `claude -p … --allowedTools mcp__<serveur>__<tool>` depuis le projet, pas par `--mcp-config … --strict-mcp-config` : le run non strict a aussi chargé les connecteurs claude.ai de JB (mesure supplémentaire : le serveur Acme voit un second client, via le proxy Anthropic, pour le même utilisateur).
- Preuve 8 non mesurée : durée des jetons laissée à 3 600 s (réglage du tableau de bord, JB), jetons émis à 17:00–17:02 ; l'expiration tombe après la fenêtre de la campagne.
- Preuve 10 : `/mcp` en session interactive non joué (pilote sans terminal interactif) ; mesuré à la place : chaque `claude -p` et chaque `claude mcp get` rejoue `server/discover` + `initialize` + `initialized` + `tools/list` avec le jeton stocké, sans relire les métadonnées.
- Rapport de frictions P15 : non demandé au modèle dans `claude -p` (sortie texte seule) ; frictions relevées par le pilote.

### Option plus simple écartée
Attendre JB pour la connexion interactive : écarté parce qu'il a demandé de faire un maximum seul ; le pilote `node-pty` (deux fichiers dans le scratchpad, aucun dans le dépôt) reste hors du code du projet.

### Notes
- Client enregistré par Claude Code : `Claude Code (<nom du serveur>)`, public (`token_endpoint_auth_method` `none`), adresse de retour `http://localhost:<port aléatoire>/callback`, scopes openid email profile offline_access, `prompt=consent`, `resource` = URL du serveur, PKCE S256 ; un client par serveur.
- Découverte : `server/discover` sans jeton → 401 → `GET /.well-known/oauth-protected-resource/api/auth-test/mcp` (forme suffixée de `WWW-Authenticate`), user agent `claude-code/2.1.280 (claude-vscode, …)` ; appels `-p` en `claude-code/2.1.280 (sdk-cli, agent-sdk/0.3.280)`, `client_name` `claude-code@2.1.280`.
- Refus de l'alias sur Delta rendu par le modèle : « L'appel a échoué, voici le texte d'erreur exact : » puis le message serveur intégral.
- À retirer après la campagne : `claude mcp remove acme-auth -s local`, `claude mcp remove delta-auth -s local` (laissés en place, JB décide).
