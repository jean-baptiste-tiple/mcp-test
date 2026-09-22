# Résultats du banc MCP

> Rempli à la main en suivant `docs/bench/protocol.md`. Chaque case porte la date (AAAA-MM-JJ) et le client loggé (`client_name@client_version`). Une case vide = non mesuré. Les conclusions alimentent E01-S05 (mcp-patterns.md).

## Empreintes des hosts (Q1)

| Host | client_name@client_version | user_agent | Date |
|------|----------------------------|------------|------|
| Claude Code (CC) | | | |
| Claude Desktop / Cowork (CD) | | | |
| claude.ai web (CW) | | | |
| ChatGPT developer mode (GPT) | | | |
| MCP Inspector (INS) | | | |

## Grille A — Moments de lecture

`init` = `initialize` observé, `list` = `tools/list` observé, dans la minute suivant le geste.

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

## Grille D — Leviers readme

Case = premier usage oui/non · chaque message oui/non · nouvelle conversation oui/non · erreurs · coût (chars × appels) · date · client.

| Levier | CC | CD | CW | GPT |
|--------|----|----|----|-----|
| none (témoin, `baseline`) | | | | |
| instructions | | | | |
| descriptions | | | | |
| name_first | | | | |
| gate | | | | |
| ack | | | | |
| hub | | | | |

Contrôle P14 (« a lu » et pas seulement « a appelé ») :

| Levier | CC | CD | CW | GPT |
|--------|----|----|----|-----|
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
