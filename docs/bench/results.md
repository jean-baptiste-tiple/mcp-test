# Résultats du banc MCP

> Rempli à la main en suivant `docs/bench/protocol.md`. Chaque case porte la date (AAAA-MM-JJ) et le client loggé (`client_name@client_version`). Une case vide = non mesuré. Les conclusions alimentent E01-S05 (mcp-patterns.md).

## Empreintes des hosts (Q1) et modèles testés

Une ligne par couple host × modèle (tag `note` de P0). Les grilles A, B, C sont mesurées sur le premier modèle de chaque host et contrôlées sur un second ; la grille D, la citation des canaris et les golden queries sont mesurées pour chaque ligne.

| Host | Modèle (tag) | client_name@client_version | user_agent | Date |
|------|--------------|----------------------------|------------|------|
| Claude Code (CC) | claude-code/sonnet | claude-code@2.1.263 | claude-code/2.1.263 (claude-vscode, agent-sdk/0.3.278) | 2026-09-22 |
| Claude Code (CC) | claude-code/opus | claude-code@2.1.263 | idem | |
| Claude Code (CC) | claude-code/fable | claude-code@2.1.263 | idem | |
| Claude Desktop / Cowork (CD) | claude-desktop/… | | | |
| claude.ai web (CW) | claude-web/… | Anthropic/ClaudeAI@1.0.0 (chat) et Anthropic/Toolbox@1.0.0 (connecteurs) ; validateur d'URL : Anthropic@1.0.0 | Claude-User (chat, connecteurs) ; python-httpx/0.28.1 (validateur) ; IP 160.79.106.x, une IP différente par requête ; protocole 2025-11-25 | 2026-09-22 |
| ChatGPT developer mode (GPT) | chatgpt/… | | | |
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
| Ajout du connecteur / démarrage | | | | |
| Nouvelle conversation (sans message) | | | | |
| Message sans rapport (« Bonjour ») | | | | |
| Message qui appelle un tool | | | | |
| Second appel de tool | | | | |
| Reconnect | | | | |

## Grille B — Propagation d'une mutation

Case = niveau minimal (L0 à L5) · `fetch:` oui/non (Q3) · date · client.

| Mutation | CC | CD | CW | GPT |
|----------|----|----|----|-----|
| M1 Tool créé | | | | |
| M2 Description modifiée | | | | |
| M3 Schéma modifié | | | | |
| M4 Tool désactivé | | | | |
| M5 Instructions modifiées | | | | |
| M6 Identité serveur | | | | |

Notification `list_changed` écrite dans le flux de réponse de `bench_mutate` (Q3 : `tools/list` spontané dans les secondes qui suivent ?) :

| Host | tools/list spontané après bench_mutate | Délai | Date · client |
|------|----------------------------------------|-------|---------------|
| CC | | | |
| CD | | | |
| CW | | | |
| GPT | | | |

Notes (divergences « fetché mais ignoré », comportements inattendus) :

-

## Grille C — Limites

Case = valeur mesurée (dernier canari vu, nombre, seuil) · date · client.

| Champ | CC | CD | CW | GPT |
|-------|----|----|----|-----|
| Description : taille max lue entière | | | | |
| Instructions : taille max lue entière | | | | |
| Instructions : exposées au modèle ? (`instr_len_500`) | | | | |
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
| | | | | |

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
