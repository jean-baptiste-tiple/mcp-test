# Epic E04 — Maquette de la plateforme MCP d'entreprise

| Champ | Valeur |
|-------|--------|
| **ID** | E04 |
| **Priorité** | P0 |
| **Statut** | 🟢 Ready |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **PRD Refs** | FR-PROTO-01 à FR-PROTO-17, NFR-PROTO-01 à 03 |
| **Référence UI** | N/A (le host est l'interface) |
| **Dépendances** | E01 |

## Objectif

Faire tourner, à côté du banc, une maquette de la plateforme décrite par les deux docs d'architecture (six outils figés, code ctx, routage serveur), prouver son contrat sans host puis sur Claude Code, claude.ai et ChatGPT, et chiffrer les sept mesures ouvertes avant de construire la plateforme pour de vrai.

## Périmètre

### IN
- `/api/proto/u/<utilisateur>/mcp`, identité par segment d'URL (ADR-003).
- Six outils préfixés (`acme_`, `delta_`), deux clients fictifs branchables ensemble dans un host.
- Schéma `proto` (13 tables, RLS), données Acme Énergies et Delta Logistique, seed rejouable.
- Routage lexical Postgres, calibré sur un jeu de phrases de test.
- Tableaux et connecteurs simulés derrière `call`, droits d'équipe, confirmation en deux temps, sondes de mesure.
- Capacité `prompts`, variantes des mesures 6 et 7.
- Preuves 1 à 8 en Vitest, preuves 9 à 12 sur les hosts, `docs/bench/results-proto.md`.

### OUT
- OAuth, connecteur admin, interface web, service connecteurs Python, coffre, liens `[[…]]`, alias de chemins, nouveautés de la plateforme (changelog du paquet), drapeaux.
- IA serveur, embeddings, entité « projet ».

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E04-S01 | Socle proto : schéma, données Acme et Delta, identité par URL, six outils déclarés, context, ctx, feedback, journal | L | 🟢 | — |
| E04-S02 | Routage lexical et find : proto.route, vocabulaire, seuils calibrés, étapes dans context | M | 🟢 | S01 |
| E04-S03 | read et write : plan, sections, révisions, brouillon et publication, version des règles | L | 🟢 | S01 |
| E04-S04 | call : catalogue, tableaux, connecteurs simulés, droits, confirmation, sondes | L | 🟢 | S01 |
| E04-S05 | Prompts suggérés, variantes de mesure, golden queries proto | S | 🟢 | S02, S03, S04 |
| E04-S06 | Campagne Claude Code headless (Opus 5.5, Sonnet 5, Fable 5.1) | M | 🟢 | S05 |
| E04-S07 | Campagne claude.ai et ChatGPT, mesures 1, 2 et 6, restitution | L | 🟢 | S06 |

S02, S03 et S04 ne se touchent pas (fichiers de services distincts, outils déclarés en S01) : parallélisables.
