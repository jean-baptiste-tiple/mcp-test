# Résultats du banc MCP

> Rempli à la main en suivant `docs/bench/protocol.md`. Chaque case porte la date (AAAA-MM-JJ) et le client loggé (`client_name@client_version`). Une case vide = non mesuré. Les conclusions alimentent E01-S05 (mcp-patterns.md).

## Empreintes des hosts (Q1) et modèles testés

Une ligne par couple host × modèle (tag `note` de P0). Les grilles A, B, C sont mesurées sur le premier modèle de chaque host et contrôlées sur un second ; la grille D, la citation des canaris et les golden queries sont mesurées pour chaque ligne.

| Host | Modèle (tag) | client_name@client_version | user_agent | Date |
|------|--------------|----------------------------|------------|------|
| Claude Code (CC) | claude-code/sonnet | claude-code@2.1.278 | claude-code/2.1.278 (claude-vscode, agent-sdk/0.3.278), IP du poste | |
| Claude Code (CC) | claude-code/opus | claude-code@2.1.278 | idem | |
| Claude Code (CC) | claude-code/fable | claude-code@2.1.278 | idem (P0 du 2026-09-22 11:00 tagué « claude-code/opus-5 » par erreur : session Fable 5) | 2026-09-22 |
| Claude Desktop / Cowork (CD) | claude-desktop/… | | | |
| claude.ai web (CW) | claude.ai/opus-5 | Runtime du chat : **claude-code@2.1.278** (ids courts) ; second client `Anthropic/ClaudeAI@1.0.0` (ids longs) ; à l'ajout du connecteur : `Anthropic/Toolbox@1.0.0` ; « Actualiser la liste des outils » : `claude-ai@0.1.0` ; validateur d'URL : `Anthropic@1.0.0` | Claude-User (chat, connecteurs) ; python-httpx/0.28.1 (validateur) ; IP 160.79.106.x, une IP différente par requête ; protocole 2025-11-25 | 2026-09-22 |
| ChatGPT developer mode (GPT) | chatgpt/gpt-5.6-luna | openai-mcp@1.0.0 | openai-mcp/1.0.0 ; IP 74.161.200.x, une IP différente par requête ; protocole 2025-11-25 à l'`initialize`, **aucun en-tête `Mcp-Protocol-Version` sur `tools/call`** | 2026-09-22 |
| MCP Inspector (INS) | inspector/none | | | |

## Grille A — Moments de lecture

`init` = `initialize` observé, `list` = `tools/list` observé, dans la minute suivant le geste.

Observation 2026-09-22 (CC, `claude mcp add` puis `claude mcp list`) : à chaque test de santé, la séquence est `server/discover` (méthode propriétaire Claude Code, en-tête `Mcp-Protocol-Version: 2026-07-28`, id `server-discover-probe-1`, rejetée par le SDK) → `initialize` (2025-11-25, id 0) → `GET /api/mcp` (tentative de flux SSE, 405 chez nous) → `notifications/initialized` → `tools/list` (4 tools). Deux fois de suite (add, puis list). Aucun appel de tool.

Observation 2026-09-22 (CW, dialogue « Ajouter un connecteur personnalisé ») : chaque validation de l'URL = un `initialize` seul (clientInfo `Anthropic@1.0.0`, `python-httpx`, protocole 2025-11-25), sans `notifications/initialized`, sans `tools/list`, sans GET, sans découverte OAuth ; 4 sondes en 2 minutes depuis 4 IP différentes. Le serveur répond 200 avec un résultat valide (vérifié par rejeu et par le client de référence du SDK).

Observation 2026-09-22 (CW, connecteur accepté en mode « Aucune connexion ») : dans les 6 s qui suivent, deux handshakes complets sous user-agent `Claude-User`, chacun `server/discover` (en-tête `Mcp-Protocol-Version: 2026-07-28`, comme Claude Code) → `initialize` → `notifications/initialized` → `tools/list` (4 tools) ; le premier avec `clientInfo` `Anthropic/Toolbox@1.0.0`, le second `Anthropic/ClaudeAI@1.0.0`. Aucun GET (contrairement à Claude Code). Chaque requête arrive d'une IP différente : le stateless est indispensable côté serveur (aucune affinité de session).

Friction CW 2026-09-22 : avec le mode « Se connecter maintenant » (option en tête du dialogue, sélectionnée par défaut), claude.ai affiche « Impossible de s'inscrire auprès du service de connexion … ajouter un OAuth Client ID » (référence `ofid_…`) sans jamais contacter `/.well-known/…` ni `/register` sur le serveur : l'échec est interne au chemin OAuth du connecteur. Un serveur sans auth doit être ajouté avec « Aucune connexion » explicitement coché ; recréer le connecteur si un premier essai a été fait dans un autre mode.

À instrumenter (suite) : `server/discover` est envoyé par Claude Code et claude.ai avant `initialize` avec un en-tête de protocole 2026-07-28 ; le journal ne garde que la méthode. Journaliser les `params` des méthodes inconnues pour comprendre ce que ces hosts attendent (candidat E02-S02 ou S05).

| Geste | CC | CD | CW | GPT |
|-------|----|----|----|-----|
| Ajout du connecteur / démarrage | init + list (+ GET 405), rejoué à chaque `claude mcp list` · 2026-09-22 | | init + list, deux fois (Toolbox puis ClaudeAI) · 2026-09-22 | discover + init ×2 + list · 2026-09-22 |
| Nouvelle conversation (sans message) | | | rien ; et au premier appel de tool de la nouvelle conversation : `tools/call` seul, sans initialize ni list (11:21:41) · la liste exposée au modèle est celle cachée à la création du connecteur (10:53) · 2026-09-22 | |
| Message sans rapport (« Bonjour ») | | | | |
| Message qui appelle un tool | discover + init + initialized + GET + **list** + call (par session) · 2026-09-22 | | discover + init + initialized + **list** + call, **à chaque tour** (runtime claude-code@2.1.278) ; un second client (ids longs) rappelle le tool sans `initialize` · 2026-09-22 | init + call, **pas de tools/list** (liste cachée depuis l'ajout du connecteur, 3 min plus tôt) · 2026-09-22 |
| Second appel de tool | | | `server/discover` + `tools/call` seuls (client ids longs), **sans initialize ni list** dans une conversation déjà ouverte · 2026-09-22 | `tools/call` seul, sans initialize ni list · 2026-09-22 |
| Reconnect | | | désactiver/réactiver : à mesurer ; **« Actualiser la liste des outils »** (réglages du connecteur) : `server/discover` + init (`claude-ai@0.1.0`) + initialized + list · 11:30:56 · 2026-09-22 | désactiver/réactiver : **aucune requête** ; **bouton « Actualiser »** de la fiche du connecteur (encart « Informations », sous la liste des tools) : `server/discover` + init ×2 + initialized + list (même séquence qu'à la création) · 11:33:41, 11:34:19, 12:00:20 · 2026-09-22 |

Lecture P0 (2026-09-22, révisée après M1) : les deux handshakes complets de claude.ai avec le runtime `claude-code@2.1.278` (10:57, 10:59) n'ont pas été reproduits ensuite : à 11:14, 11:19 et 11:21 (dont une nouvelle conversation), claude.ai n'envoie que `server/discover` + `tools/call` ou `tools/call` seul, et expose au modèle la liste cachée à la création du connecteur. ChatGPT ne relit pas non plus (initialize + call, ou call seul). Claude Code lit la liste à l'ouverture de session et la relit sur notification. Mesuré en M1 : Claude Code L0, claude.ai et ChatGPT au-delà de L2.

## Grille B — Propagation d'une mutation

Case = niveau minimal (L0 à L5) · `fetch:` oui/non (Q3) · date · client.

| Mutation | CC | CD | CW | GPT |
|----------|----|----|----|-----|
| M1 Tool créé | **L0** (notification) · fetch: oui (0,5 s) · P2 : le modèle liste `mcp__bench__bench_probe_1` dans le même tour, **nom seul** ; P3 avec chargement ToolSearch : description servie citée mot pour mot, canari `[C:manual:desc:end:0001]` intact, schéma `{"properties":{},"type":"object"}` ; le chargement n'a produit **aucune requête serveur** (liste cachée depuis le `tools/list` de 11:11:51) · 2026-09-22 · claude-code@2.1.278 · opus | | L0 : **non** (P2 : 4 tools `mcp__test__*`, ni probe_1 ni probe_2 ; `bench_readme` « listé mais non chargé » = différé aussi) · L1 : **non** (11:19:41, appel réel `bench_whoami` seul, sans `tools/list` ; le modèle voit 7 tools côté serveur et 4 côté host, et le dit) · L2 : **non** (11:21:41, nouvelle conversation = `tools/call` seul, **ni initialize ni tools/list** ; la liste exposée date de la création du connecteur, 10:53) · **L3-bis : oui** — « Actualiser la liste des outils » dans les réglages du connecteur (11:30:56 : `server/discover` → `initialize` avec clientInfo **`claude-ai@0.1.0`** → `initialized` → `tools/list` à 7) ; P2 ensuite : les 7 tools `mcp__test__*`, « all deferred, not loaded » · niveau minimal = **L3-bis** (geste dans les réglages, pas de reconnexion) · 2026-09-22 · opus-5 | L0 : **non fetché** (aucun `tools/list` depuis la mutation) mais **rapporté** : P2 liste `bench_probe_3` de mémoire de conversation, sans probe_1 ni probe_2 ; P5 confirme : « not currently exposed as an available tool in this session » · L2 : **non fetché** (11:26:02, nouvelle conversation avec le connecteur activé = `tools/call bench_whoami` seul, sans `tools/list`) mais P2 **recopie les 7 tools de la sortie de whoami** dans le même ordre : à ne jamais prendre pour une liste du host ; P5 dans cette conversation : `bench_probe_1` « pas exposé » · désactiver/réactiver : **non** (**aucune requête** au serveur, nouvelle conversation avec `@test` → les 4 anciens tools, nommés `tools.mcp__test__*`) · **L3 « Déconnecter / Reconnecter » : oui** (11:33:41 et 11:34:19 : `server/discover` → `initialize` ×2 → `initialized` → `tools/list` à **7**) ; mais P2 ensuite ne cite que 4 des 7 (whoami, probe_1, probe_2, mutate : ni echo, ni readme, ni probe_3) → **fetché 7, rapporté 4** ; appel réel de `bench_probe_3` réussi (`{"message":"hello"}`) : le host a les 7, le modèle liste mal · niveau minimal = **L3 « Déconnecter / Reconnecter »** · le connecteur ne peut pas être supprimé (L4 impossible) · 2026-09-22 · gpt-5.6-luna |
| M2 Description modifiée | fetch : oui par notification (11:39:16 `bench_mutate` id 5 → `tools/list` id 6 à 0,7 s, 7 tools servis avec la v2) · L0 : **non** — P3 avec ToolSearch cite encore la v1 (`[C:manual:desc:end:0001]`) alors que `bench_probe_2` et `bench_probe_3` sont apparus au même moment : **le host met à jour les noms, pas la définition d'un tool déjà chargé** (« fetché mais non appliqué ») · L3 `/mcp` reconnect : **non** — trois reconnexions (11:44:47, 11:45:27, 11:45:31), chacune avec `initialize` + `tools/list` à 7 servis en v2, et le modèle cite toujours `0001` : la définition chargée est figée pour la durée de la conversation · **L2 : oui** (nouvelle session, P3 → `0002`) · niveau minimal = **L2** · règle Claude Code : les noms se mettent à jour en direct (notification), les définitions (description, schéma) d'un tool déjà chargé ne changent qu'en nouvelle conversation · 2026-09-22 · claude-code@2.1.278 · opus | | avant rafraîchissement : v1 `0001` (liste du 11:30, antérieure à M2), y compris en nouvelle conversation · **après « Actualiser » (11:52:32, `claude-ai@0.1.0` init + list à 7) : v2 `0002` dans l'index différé, en nouvelle conversation** · niveau minimal = **L3-bis** (même geste qu'en M1) · 2026-09-22 · opus-5 | avant rafraîchissement : v1 `0001` entière (liste du 11:34, antérieure à M2) · après « Déconnecter / Reconnecter » : **geste non observé côté serveur** à trois reprises (aucune requête ChatGPT après 11:38), et le prompt reformulé rend `0001` = liste du 11:34 · **bouton « Actualiser »** (fiche du connecteur, encart « Informations », sous la liste des tools) à 12:00:20 : `server/discover` → `initialize` ×2 → `initialized` → `tools/list` à 7 ; c'est le geste de rafraîchissement ChatGPT (11:33 et 11:34 étaient probablement le même) · nouvelle conversation ensuite : `0002` sur `bench_probe_1` · niveau minimal = **bouton « Actualiser »** (équivalent L3-bis) · 2026-09-22 · gpt-5.6-luna |
| M3 Schéma modifié | | | | |
| M4 Tool désactivé | | | | |
| M5 Instructions modifiées | L0 : **non** (M5 depuis la session, `list_changed_sent = true`, mais P6 cite l'ancien texte : les instructions ne transitent que par `initialize`) · L3 `/mcp` reconnect (11:56:22, `initialize` refait) : **non**, « still the copy from the start of the session » · L2 nouvelle session (11:57:58) : **aucune instruction dans le contexte**, « le serveur était encore en cours de connexion au démarrage de la session » : les instructions ne sont injectées qu'au démarrage, et seulement si le serveur est déjà connecté (course) · nouvelle session avec `bench` connecté avant le premier message : **`0005` cité mot pour mot** · niveau minimal = **L2** (nouvelle session, connexion établie) · 2026-09-22 · claude-code@2.1.278 · opus-5 | | **sans objet** : les instructions ne sont jamais exposées au modèle (P6 avant et après « Actualiser », deux conversations) · 2026-09-22 · opus-5 | **sans objet** : instructions jamais exposées (P6) · 2026-09-22 · gpt-5.6-luna |
| M6 Identité serveur | | | | |

Notification `list_changed` écrite dans le flux de réponse de `bench_mutate` (Q3 : `tools/list` spontané dans les secondes qui suivent ?) :

| Host | tools/list spontané après bench_mutate | Délai | Date · client |
|------|----------------------------------------|-------|---------------|
| CC | **oui** : `tools/list` id 4 juste après le `tools/call bench_mutate` id 3, réponse à 5 tools, aucun geste humain | 0,5 s | 2026-09-22 11:11:51 · claude-code@2.1.278 · opus |
| CD | | | |
| CW | **non** : aucun `tools/list` après le `tools/call bench_mutate` (id 422314386, `bench_probe_2` créé) | — | 2026-09-22 11:14:28 · client ids longs (Anthropic/ClaudeAI) · opus-5 |
| GPT | **non** : aucun `tools/list` après le `tools/call bench_mutate` (id 0, `bench_probe_3` créé) | — | 2026-09-22 11:14:39 · openai-mcp@1.0.0 · gpt-5.6-luna |

Notes (divergences « fetché mais ignoré », comportements inattendus) :

- GPT 2026-09-22 : « rapporté mais pas fetché » : après avoir créé `bench_probe_3` lui-même, le modèle le liste comme disponible sans que le host ait relu `tools/list` (les tools créés par les autres hosts n'y figurent pas). Inversement, après la reconnexion (7 tools fetchés), le modèle n'en liste que 4 alors que les 7 sont appelables. Sur ChatGPT, un P2 seul n'est jamais fiable dans les deux sens : vérifier par un appel réel (P5) ou par le journal (Q3).
- CW 2026-09-22 : préfixe `mcp__test__` = nom du connecteur saisi par l'utilisateur (« test mcp »), pas `serverInfo.name` ; `bench_readme` « listé mais non chargé » : le runtime claude.ai (claude-code@2.1.278) diffère aussi les définitions de tools.
- CC 2026-09-22 : les tools MCP sont exposés au modèle sous `mcp__<nom local du serveur>__<tool>` (ici `bench` = nom passé à `claude mcp add`, pas `serverInfo.name`). Un tool ajouté par notification arrive **nom seul** : le modèle dit ne pas avoir chargé son schéma ni sa description tant qu'il ne le charge pas via ToolSearch. P3 confirmé (11:20) : sans chargement, « no description has reached me from the host » ; le modèle ne connaît que le texte qu'il a lui-même envoyé dans `bench_mutate`. Conséquence pour la grille C : sur Claude Code, une description n'est lue qu'au chargement du tool (ToolSearch, invisible pour le serveur), pas à `tools/list` ; les prompts P3/P8 doivent autoriser ce chargement.

## Grille C — Limites

Case = valeur mesurée (dernier canari vu, nombre, seuil) · date · client.

| Champ | CC | CD | CW | GPT |
|-------|----|----|----|-----|
| Description : taille max lue entière | entière après chargement ToolSearch (68 car. testés) ; nom seul avant · 2026-09-22 · opus | | **liste différée tronquée à ~80 caractères** avec « … » (première phrase) tant que le tool n'est pas chargé par `tool_search` : « Changes the active scenario: create, update, disable or enable a tool, replace … » ; P3 sur un tool non chargé ne rend que cette ligne · 2026-09-22 · opus-5 | entière (68 car., v1 citée mot pour mot) dans la 1re conversation ; **refus** de citer en nouvelle conversation (« internal tool description ») · 2026-09-22 · gpt-5.6-luna |
| Instructions : taille max lue entière | | | | |
| Instructions : exposées au modèle ? (`instr_len_500`) | **oui**, citées mot pour mot (P6, baseline, 108 caractères) · 2026-09-22 · opus-5 | | **non** : « No server-level instructions for the test bench server are present in my context » (P6, deux conversations) · 2026-09-22 · opus-5 | **non** : « I don't have the bench server's instruction text in my current context » (P6) · 2026-09-22 · gpt-5.6-luna |
| Nom : longueur max acceptée | | | | |
| Nom : caractères refusés (`name_chars`) | | | | |
| Nombre de tools : seuil de dégradation (différé, refus) | | | | |
| Schéma profond : exposé entier ? | | | | |
| Identité : où apparaissent name / title / version | | | | |

Tailles servies (Q4) :

| Scénario | tools | chars | ≈ tokens |
|----------|-------|-------|----------|
| | | | |

## Grille D — Leviers readme (par modèle)

Dépend du modèle : une ligne par levier × modèle. Case = premier usage oui/non · chaque message oui/non · nouvelle conversation oui/non · erreurs · coût (chars × appels) · date. Pour GPT, le modèle de la ligne est celui de ChatGPT.

| Levier · modèle | CC | CD | CW | GPT |
|-----------------|----|----|----|-----|
| none (témoin) · sonnet | | | | |
| none (témoin) · opus | | | | |
| none (témoin) · fable | | | | |
| instructions · sonnet | | | | |
| instructions · opus | | | | |
| instructions · fable | | | | |
| descriptions · sonnet | | | | |
| descriptions · opus | | | | |
| descriptions · fable | | | | |
| name_first · sonnet | | | | |
| name_first · opus | | | | |
| name_first · fable | | | | |
| gate · sonnet | | | | |
| gate · opus | | | | |
| gate · fable | | | | |
| ack · sonnet | | | | |
| ack · opus | | | | |
| ack · fable | | | | |
| hub · sonnet | | | | |
| hub · opus | | | | |
| hub · fable | | | | |

Contrôle P14 (« a lu » et pas seulement « a appelé »), par levier × modèle :

| Levier · modèle | CC | CD | CW | GPT |
|-----------------|----|----|----|-----|
| | | | | |

Citation des canaris (P8, P6) par modèle sur le même host : si deux modèles diffèrent sur le même host et le même scénario, la limite est côté modèle (attention, mémoire), pas côté host.

| Scénario · modèle | CC | CD | CW | GPT |
|-------------------|----|----|----|-----|
| | | | | |

## Frictions (P15)

| Date | Host | Friction observée | Cause supposée | Action |
|------|------|-------------------|----------------|--------|
| 2026-09-22 | GPT | En nouvelle conversation, le modèle refuse de citer une description de tool ou les instructions (« internal », « hidden server instructions ») alors qu'il l'avait fait dans la conversation précédente | Garde-fou du modèle déclenché par la formulation « quote verbatim … instructions » | Reformuler P3/P6/P8 sans « instructions/internal » : « Which bracketed codes of the form [C:…] appear in the descriptions of the bench tools you can see? List them with the tool name. » |
| 2026-09-22 | CC | En nouvelle session, aucune instruction serveur dans le contexte quand le serveur MCP n'a pas fini de se connecter au moment où le prompt système est construit ; la reconnexion ultérieure ne les injecte pas | Injection des instructions au démarrage seulement, sans rattrapage | Attendre l'état « connected » dans `/mcp` avant le premier message ; conséquence produit : ne rien confier d'indispensable aux instructions sur Claude Code non plus |
| 2026-09-22 | GPT | Ni le commutateur activé/désactivé ni « Déconnecter / Reconnecter » ne rafraîchissent la liste ; seul le bouton « Actualiser » en bas de la fiche du connecteur (peu visible) relit `tools/list` | Cache de la définition du connecteur (`asdk_app_v_…`, « dev mode ») | Documenter ce bouton comme l'action de rafraîchissement ChatGPT |
| 2026-09-22 | CW | Les descriptions exposées au modèle sont tronquées à ~80 caractères (première phrase) tant que le tool n'est pas chargé ; les instructions serveur n'apparaissent pas du tout | Liste différée du runtime claude.ai (comme Claude Code), instructions non injectées | Pour claude.ai, tout ce qui compte tient dans les 80 premiers caractères de la description ; ne rien confier aux instructions |

## Conclusions pour E01-S05

Pour chaque affirmation de mcp-patterns.md visée, noter : confirmé / infirmé / précisé, scénario source, date.

| Section | Affirmation actuelle | Statut | Mesure | Scénario | Date |
|---------|----------------------|--------|--------|----------|------|
| §2.1 | Les instructions sont injectées chez l'host | | | | |
| §3 | L'essentiel dans la première phrase, les modèles tronquent | | | | |
| §3 | Peu de tools (≤ 10) | | | | |
| §7 | Stateless : pas de notification server→client | | | | |
| §8 | Les hosts cachent instructions et descriptions ; déconnecter/reconnecter | | | | |
| §10 | `listChanged` et bump de version à chaque évolution | | | | |
| Nouveau | Readme + ack comme canal de mise à jour | | | | |
