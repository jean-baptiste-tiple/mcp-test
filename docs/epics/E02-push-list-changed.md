# Epic E02 — Push listChanged (transport stateful)

| Champ | Valeur |
|-------|--------|
| **ID** | E02 |
| **Priorité** | P1 |
| **Statut** | ⬜ Draft |
| **Parcours** | 4.1 Piloter |
| **PRD Refs** | FR-PILOT-05 |
| **Référence UI** | N/A |
| **Dépendances** | E01 |

## Objectif

Mesurer si chaque host honore `notifications/tools/list_changed` quand le serveur tient un flux ouvert (transport stateful), et amender ADR-001.

## Périmètre

### IN
- Option A : Redis Upstash, `redisUrl` dans la route, retrait de `disableSse`.
- Option B : même serveur en local (`next start`) derrière un tunnel, si la durée des fonctions Vercel empêche la mesure.
- `bench_mutate` émet réellement la notification ; `list_changed_sent = true` journalisé.

### OUT
- Subscriptions de resources, elicitation.

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E02-S01 | Transport stateful et mesure de list_changed par host | M | ⬜ | E01-S04 |
