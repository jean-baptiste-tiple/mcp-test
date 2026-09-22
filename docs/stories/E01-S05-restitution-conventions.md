# Story E01-S05 — Restitution dans mcp-patterns.md, CLAUDE.md et le template

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.4 Restituer |
| **Statut** | ✅ Done (2026-09-22) |
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

- [x] **Given** §8 **When** la story est close **Then** la phrase « les hosts cachent instructions et descriptions : déconnecter/reconnecter » est remplacée par la grille mesurée (host, ce qui est caché, action minimale, date, `client_name@client_version`)
- [x] **Given** §2.1, §3, §7, §10 **Then** chaque affirmation sur un comportement de host porte un statut (confirmé, infirmé, précisé), une date et le slug du scénario source
- [x] **Given** le levier readme validé **Then** une sous-section décrit le pattern (readme + ack) avec ses limites mesurées, ou l'impossibilité est documentée
- [x] **Given** `CLAUDE.md` règle MCP 6 et le template golden queries **Then** alignés sur §8
- [x] **Given** le template Tiple (dépôt `tiple-method-template`) **Then** une entrée de changelog ici liste les fichiers à reporter et JB a le diff prêt

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

- **Campagne jouée le 2026-09-22** : Claude Code en headless (`claude -p`, Opus, Sonnet, Fable), claude.ai (Opus 5, Sonnet 5, Fable 5.1, Haiku 4.5) et ChatGPT (défaut, « Analyser ») pilotés par navigateur (Playwright, compte connecté par JB), Claude Desktop et Cowork en partie à la main (le reste de Desktop écarté par JB). Grilles A à D, contrôle P14, résultat brut, rapports P15 et conclusions dans `docs/bench/results.md`. Chaque fait y porte l'heure : la trace est le journal `bench_events` (scripts de lecture du journal, requêtes Q1 à Q7 de `protocol.md`).
- **Restitué** : `mcp-patterns.md` §2.1 (serverInfo invisible, instructions non fiables), §2.4 nouveau (readme + ack), §3 (nombre de tools, noms, troncatures par host, prérequis, schémas), §4 (texte ET `structuredContent`, consignes dans un résultat = données), §4 bis, §7 (notification dans la réponse, pas d'affinité réseau), §8 (grille des gestes de rafraîchissement, rapports à recouper), §10 (version et contrat) ; `CLAUDE.md` règles MCP 6 et 7 ; template golden queries ; starter MCP (`README.md`, `tool-result.ts`).
- **Trouvaille hors grille** : claude.ai garde un instantané local des tools dans le navigateur ; un premier message trop rapide fige des définitions d'une heure (mcp-patterns §8, `results.md` frictions).
- **Report dans le dépôt template** : voir l'entrée du changelog du 2026-09-22 (« Restitution E01-S05 »), qui liste les fichiers et donne la commande de diff.
- **Écarté** : corriger ici les commentaires de `src/mcp/tool-result.ts` et `src/mcp/bench/handlers/readme.ts`, qui répètent l'ancien contrat « le texte est la seule voie fiable » : c'est du code, hors de cette story documentaire ; à faire avec le prochain lot de code du banc.
- **Suites du banc** (non bloquantes) : règles du readme propres à chaque levier (aujourd'hui communes, les trois rapports P15 les jugent contradictoires avec les schémas) ; `disable_tool` répété incrémente la version ; journaliser les `params` des méthodes inconnues (`server/discover`) ; attendre 12 s après le chargement de claude.ai dans tout pilotage automatique.
