# Story E02-S01 — Transport stateful et mesure de list_changed par host

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E02 — Push listChanged |
| **Parcours** | 4.1 Piloter |
| **Statut** | ⬜ Draft |
| **Priorité** | Should |
| **Référence UI** | N/A |
| **Conventions** | mcp, deploy, testing |
| **Estimation** | M |

## Contexte

À ouvrir après E01-S04, avec l'amendement d'ADR-001. Choix A (Redis Upstash, `redisUrl`, retrait de `disableSse`) ou B (serveur local plus tunnel) selon la durée de fonction Vercel constatée en E01.

**Refs :** FR-PILOT-05 ; ADR-001.

## Critères d'acceptation (à affiner à l'ouverture)

- [ ] **Given** un host connecté en session **When** `bench_mutate` crée un tool **Then** `list_changed_sent = true` est journalisé et l'appel `tools/list` suivant du host est visible dans le journal sans action humaine, ou son absence est consignée par host

## Implémentation

À définir à l'ouverture.

## Tests attendus

À définir à l'ouverture.
