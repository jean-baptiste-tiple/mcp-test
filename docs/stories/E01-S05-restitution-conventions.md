# Story E01-S05 — Restitution dans mcp-patterns.md, CLAUDE.md et le template

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.4 Restituer |
| **Statut** | ⬜ Draft (Ready quand `docs/bench/results.md` est rempli pour les 4 hosts) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp |
| **Estimation** | S |

## Contexte

Le banc n'a de valeur que si ses mesures remplacent les affirmations des conventions. Story documentaire, portée par le pilote : aucun code.

**Refs :**
- PRD : FR-REST-03, NFR-REST-01
- Conventions visées : `.claude/conventions/mcp-patterns.md` §2.1, §3, §7, §8, §10 ; `CLAUDE.md` règle MCP 6 ; `.claude/templates/mcp-golden-queries.tmpl.md` (note « les hosts cachent »)

## Critères d'acceptation

- [ ] **Given** §8 **When** la story est close **Then** la phrase « les hosts cachent instructions et descriptions : déconnecter/reconnecter » est remplacée par la grille mesurée (host, ce qui est caché, action minimale, date, `client_name@client_version`)
- [ ] **Given** §2.1, §3, §7, §10 **Then** chaque affirmation sur un comportement de host porte un statut (confirmé, infirmé, précisé), une date et le slug du scénario source
- [ ] **Given** le levier readme validé **Then** une sous-section décrit le pattern (readme + ack) avec ses limites mesurées, ou l'impossibilité est documentée
- [ ] **Given** `CLAUDE.md` règle MCP 6 et le template golden queries **Then** alignés sur §8
- [ ] **Given** le template Tiple (dépôt `tiple-method-template`) **Then** une entrée de changelog ici liste les fichiers à reporter et JB a le diff prêt

## Implémentation

### Fichiers à modifier
- `.claude/conventions/mcp-patterns.md`
- `CLAUDE.md`
- `.claude/templates/mcp-golden-queries.tmpl.md`
- `docs/changelog.md`

## Tests attendus

N/A (documentaire). Vérification : relecture croisée avec `docs/bench/results.md`, chaque fait cite sa requête SQL.

## Post-implémentation

### Notes
