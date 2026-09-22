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
