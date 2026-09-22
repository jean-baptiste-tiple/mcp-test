# Epic E01 — Banc MCP stateless

| Champ | Valeur |
|-------|--------|
| **ID** | E01 |
| **Priorité** | P0 |
| **Statut** | ✅ Done (2026-09-22) |
| **Parcours** | 4.1 Piloter, 4.2 Observer, 4.3 Faire lire le readme, 4.4 Restituer |
| **PRD Refs** | FR-PILOT-01..05, FR-OBS-01..05, FR-README-01..05, FR-REST-01..04 |
| **Référence UI** | N/A |
| **Dépendances** | — |

## Objectif

Mesurer, host par host, quand les métadonnées MCP sont lues, ce qui est tronqué, l'action minimale pour voir une mise à jour, et le levier qui force la lecture d'un readme ; puis corriger mcp-patterns.md avec ces faits.

## Périmètre

### IN
- Endpoint stateless piloté par la base, journal des requêtes, quatre sondes, leviers readme, catalogue de scénarios avec canaris, protocole et grille de résultats, restitution dans les conventions.

### OUT
- Push `list_changed` (E02), OAuth (E03), interface web, widgets.

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E01-S01 | Setup technique : starter MCP sans widgets, Supabase, migrations | M | 🟢 | — |
| E01-S02 | Registre de tools en base et journal des requêtes | L | 🟢 | E01-S01 |
| E01-S03 | Sondes whoami, mutate, readme et leviers readme | M | 🟢 | E01-S02 |
| E01-S04 | Catalogue de scénarios, seed, protocole, golden queries | M | 🟢 | E01-S02 |
| E01-S05 | Restitution dans mcp-patterns.md, CLAUDE.md et le template | S | ⬜ | Campagne manuelle sur les 4 hosts |
