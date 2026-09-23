# Brief Produit — MCP Bench

## Problème

Les conventions MCP de Tiple Method (`.claude/conventions/mcp-patterns.md` §2.1, §3, §7, §8, §10) reposent sur des observations ponctuelles faites sur mcp-cv-editor : « les hosts cachent instructions et descriptions, déconnecter/reconnecter avant de tester », « les modèles tronquent, l'essentiel dans la première phrase », « ≤ 10 tools ». Personne ne sait, host par host :

- quand les instructions serveur et la liste des tools sont lues (ouverture de session, chaque message, ajout du connecteur) ;
- quelle action minimale rend visible un tool créé ou modifié (rien, nouvelle conversation, reconnexion, suppression du connecteur) ;
- à partir de quelle taille une description, un nom de tool ou les instructions sont tronqués ;
- combien de tools un host accepte avant de dégrader (report des schémas, refus) ;
- si `listChanged` ou un bump de `serverInfo.version` ont un effet ;
- s'il est possible de forcer la lecture d'un « readme » du serveur au premier usage, voire à chaque demande.

Coût actuel : une itération de métadonnée sur un produit MCP = déconnexion/reconnexion sur deux hosts, environ 10 minutes par essai, sans certitude d'évaluer la nouvelle version. Deux rapports de frictions d'agents ont trouvé en un test ce que les reviews de code n'avaient pas vu : une hypothèse fausse sur un host coûte des heures par produit.

Pourquoi maintenant : quatre hosts à couvrir (Claude Code, Claude Desktop/Cowork, claude.ai, ChatGPT), tous en évolution rapide, et un prochain produit MCP qui démarre sur ces conventions.

## Solution

Un serveur MCP unique sur Vercel dont les tools, les instructions et l'identité sont des lignes Supabase (modification sans redéploiement), qui journalise chaque requête JSON-RPC par client, avec quatre tools sondes (whoami, echo, mutate, readme) et des codes canaris dans chaque texte variable. Les mesures sont consolidées dans une grille par host, puis réinjectées dans mcp-patterns.md et le template Tiple.

## Utilisateurs cibles

| Persona | Rôle | Besoin principal | Frustration actuelle |
|---------|------|-----------------|---------------------|
| JB | Auteur de Tiple Method, testeur | Savoir ce que chaque host lit, quand, et l'action minimale de rafraîchissement | Conventions fondées sur des anecdotes ; 10 min par essai sans certitude |
| Agent hôte | Modèle de Claude Code, Claude Desktop/Cowork, claude.ai, ChatGPT | Découvrir les tools et leurs mises à jour sans intervention humaine | Caches opaques, métadonnées tronquées, pas de canal fiable pour les mises à jour |

## Scope MVP

### IN — Ce qu'on livre
1. Endpoint `/api/mcp` Streamable HTTP stateless sur Vercel ; tools, instructions et serverInfo lus en base à chaque requête.
2. Journal de toutes les requêtes JSON-RPC : méthode, clientInfo, version de protocole, user-agent, IP, tool appelé, nombre de tools servis, taille de la réponse.
3. Quatre sondes : `bench_whoami`, `bench_echo`, `bench_mutate`, `bench_readme`.
4. Leviers de lecture du readme configurables par scénario : instructions, descriptions, name_first, gate, ack, hub.
5. Catalogue de scénarios généré par script, avec canaris : longueur des descriptions, des noms, des instructions ; nombre de tools ; identité serveur ; forme des schémas.
6. Protocole manuel par host et par modèle (Claude : Sonnet, Opus, Fable ; ChatGPT : modèles du sélecteur) et grille de résultats. Le serveur ne voit que le host : le testeur tague chaque session (host/modèle) au premier appel de `bench_whoami`.
7. Restitution dans mcp-patterns.md, CLAUDE.md règle MCP 6, template golden queries, puis report dans le template Tiple.

### OUT — Ce qu'on ne fait PAS
- Interface d'administration : Supabase Studio suffit.
- OAuth 2.1 : phase 3 (epic E03, Draft).
- Transport stateful et push `listChanged` : phase 2 (epic E02, Draft).
- Widgets MCP Apps.
- Automatisation des hosts : les manipulations côté host restent manuelles.
- Multi-utilisateur, RLS par utilisateur.

## Contraintes

- Serveur public sans donnée utilisateur : dérogation à la règle MCP 4 du CLAUDE.md, figée par ADR-002.
- Vercel : fonctions courtes (60 s), pas de flux long : le push `listChanged` est conditionnel (ADR-001).
- Le serveur ne voit pas les tours de conversation : « à chaque demande » est approximé par un TTL.
- Les hosts évoluent : chaque résultat est daté et porte la version cliente loggée.
- Zéro IA serveur (règle Tiple, respectée : le banc n'appelle aucun modèle).
- Hook projet : pas de pipe dans les commandes Bash.

## Métriques de succès

| KPI | Cible | Comment mesurer |
|-----|-------|-----------------|
| Grille de propagation | 4 hosts × 6 mutations, action minimale connue pour chaque case | `docs/bench/results.md` |
| Seuils de troncature | Valeur mesurée par host : description, nom, instructions, nombre de tools | `results.md`, canaris cités par l'agent |
| Readme forcé | Au moins un levier lu à 100 % au premier usage sur chaque host, ou impossibilité documentée | `bench_events` : readme avant le premier autre tool |
| Conventions à jour | §2.1, §3, §7, §8, §10 de mcp-patterns.md avec statut mesuré et date | Diff du fichier |
| Coût d'itération | Changement de tool visible côté serveur sans redéploiement, moins d'une minute | Chrono entre édition et `tools/list` suivant |

## Risques connus

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Les hosts changent de comportement | Élevé | Élevée | Résultats datés, clientInfo loggé, banc rejouable |
| Empreinte client insuffisante pour reconstituer une conversation en stateless | Moyen | Moyenne | clientInfo + user-agent + IP + fenêtre temporelle ; E02 stateful si nécessaire |
| mcp-handler refuse une init asynchrone ou des schémas JSON bruts | Moyen | Moyenne | Handler créé par requête depuis un snapshot ; handlers bas niveau `tools/list` et `tools/call` ; vérifié en S02 |
| Limite de durée Vercel bloque `listChanged` | Moyen | Élevée | E02 : Redis, ou serveur local plus tunnel |
| Pollution du journal (serveur public) | Faible | Faible | Filtre par clientInfo et user-agent ; URL non publiée |

## Évolution E04 — Maquette de la plateforme MCP d'entreprise (2026-09-23)

### Problème
À partir des mesures d'E01, JB a conçu une plateforme MCP d'entreprise : six outils figés, un code ctx exigé partout, un routage des intentions fait par le serveur ([architecture fonctionnelle](https://claude.ai/artifact/Hjg9VEJ5EMwtDu8nqJ7PYg), [architecture technique](https://claude.ai/artifact/Dumt9aN5erv1eGtiPq14ZK)). Sept mesures restent ouvertes, et rien ne prouve encore que les trois hosts suivent ce contrat. Construire la plateforme sur une hypothèse fausse coûterait des semaines ; une maquette qui tourne coûte quelques jours.

### Solution
Un second serveur MCP dans le banc, à côté du premier qui reste intact : `/api/proto/u/<utilisateur>/mcp`. Six outils préfixés par la marque du client, données fictives dans le schéma `proto` du Supabase du banc, connecteurs simulés sans réseau, journal de chaque appel. Deux clients fictifs, **Acme Énergies** (`acme_`) et **Delta** (`delta_`), branchés en même temps dans le même host : les noms d'outils par client se vérifient aussi. Code organisé comme le futur paquet : schémas Zod, services, adaptateur MCP fin.

### Scope E04
- IN : les six outils, le code ctx et sa version des règles, le budget de `context`, le routage lexical Postgres, les tableaux derrière `call`, cinq fonctions de connecteurs simulées, les droits d'équipe, la confirmation en deux temps, la capacité `prompts`, les données Acme et Delta, les preuves sans host (Vitest) puis sur Claude Code, claude.ai et ChatGPT, `docs/bench/results-proto.md`.
- OUT : OAuth (identité = segment d'URL, ADR-003), IA serveur, embeddings, entité « projet », connecteur admin, interface web, service connecteurs Python, coffre de secrets, liens `[[…]]`, alias de chemins.

### Succès
Les huit preuves sans host passent ; sur les trois hosts, `context` est appelé en premier, les golden queries suivent la bonne procédure en deux appels avant la première action avec accord avant tout envoi ; les sept mesures ont un chiffre ; les changements à apporter aux deux docs d'architecture sont listés.

## Évolution E03 — Authentification des assistants (2026-09-23)

### Problème
La section « Connexion et identité » du [doc technique](https://claude.ai/artifact/Dumt9aN5erv1eGtiPq14ZK) repose sur une hypothèse jamais testée : Supabase, en serveur d'autorisation OAuth 2.1 avec enregistrement dynamique, suffit pour connecter Claude Code, claude.ai et ChatGPT à un serveur MCP servi sur plusieurs sous-domaines, un par client, l'organisation venant de l'adresse appelée et l'appartenance étant revérifiée à chaque appel. Si c'est faux, il faut une façade d'autorisation devant Supabase, et l'architecture change. Le banc a déjà ce qu'il faut : un projet Supabase dont le serveur OAuth publie son point d'enregistrement dynamique, un déploiement Vercel, les trois hosts branchés.

### Solution
Un troisième serveur MCP dans le banc, minimal et protégé par OAuth : `/api/auth-test/mcp`, servi sur deux noms d'hôte (Acme, Delta) rattachés à la branche `e03-oauth`, deux outils (`whoami`, `echo`), un schéma `oauth_test` (organisations, membres, journal), la page de connexion du starter et la page de consentement du serveur OAuth de Supabase. Sans host, Vitest prouve le 401 par hôte, la découverte par hôte, l'appartenance et son retrait ; sur les hosts, la campagne relève le parcours complet, les deux connecteurs côte à côte, le second utilisateur, l'expiration et la révocation, ce que chaque host envoie, la relecture des outils à la reconnexion. Le verdict tombe dans l'ADR-004 : Supabase suffit, ou il faut une façade, et pour quoi.

### Scope E03
- IN : schéma `oauth_test` et seed, organisation par nom d'hôte, métadonnées RFC 9728 par hôte, 401 `WWW-Authenticate`, jeton vérifié par la JWKS, appartenance relue à chaque appel sous le jeton (RLS), journal, outils `whoami` et `echo`, pages `/login`, `/oauth/consent`, `/auth-test/grants`, préversion sur deux domaines, protocole et campagne sur Claude Code, claude.ai et ChatGPT, `docs/bench/results-oauth.md`, verdict ADR-004, changements proposés au doc technique.
- OUT : signup, mot de passe oublié, lien magique, hook Custom Access Token, jetons de service, connecteur admin, façade d'autorisation (objet du verdict), toute modification de `/api/mcp`, `/api/proto/*`, `src/mcp/`, `src/proto/`.

### Succès
Les preuves sans host passent ; sur chaque host, le parcours complet aboutit ou l'échec est nommé avec sa cause ; les questions 5 à 11 du cadrage ont chacune une réponse datée par host ; l'ADR-004 porte un verdict argumenté ; la liste des changements à la section « Connexion et identité » est prête.
