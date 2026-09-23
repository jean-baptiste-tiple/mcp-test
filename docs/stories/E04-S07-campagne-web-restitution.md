# Story E04-S07 — Campagne claude.ai et ChatGPT, mesures 1, 2 et 6, restitution

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, testing |
| **Estimation** | L |

## Contexte

Les hosts web se pilotent par le navigateur (Playwright MCP, sessions de JB) comme en E01. Ce qui touche aux comptes de JB se fait avec lui : ajout des connecteurs Acme et Delta sur claude.ai et ChatGPT, pose puis retrait de la phrase dans ses préférences (mesure 1). La story se termine par la restitution : résultats et changements proposés aux deux docs d'architecture.

**Refs :**
- PRD : FR-PROTO-17, critères « hosts » du parcours 4.5
- `docs/bench/protocol.md` §0, §1, section « Serveur proto » ; `docs/proto-golden-queries.md`
- Pièges E01 : claude.ai — premier message ≥ 12 s après le chargement, « Actualiser la liste d'outils » puis nouvelle conversation, jamais déconnecter-reconnecter, instructions jamais lues ; ChatGPT — `@connecteur`, bouton « Actualiser » de la fiche, annonce des succès qui n'ont pas eu lieu

## Critères d'acceptation

- [ ] **Given** claude.ai (modèle par défaut et un second) et ChatGPT (défaut et raisonnement) **When** les golden queries **Then** même grille qu'en S06 (preuves 9, 10, 11, routage Acme / Delta), recoupée au journal
- [ ] **Given** mesure 1 **Then** avec JB : phrase posée dans les préférences claude.ai et les instructions personnalisées ChatGPT, demande sans nommer le connecteur, premier appel ; puis phrase retirée ; témoin sans phrase
- [ ] **Given** mesure 2 **Then** affichage des prompts suggérés par host (où, champs visibles), prompt choisi, enchaînement suivi, rafraîchissement après ajout d'un prompt
- [ ] **Given** mesure 6 **Then** `domains` renseigné puis null (rafraîchissement propre à chaque host entre les deux) : sur une demande de domaine sans nommer le connecteur, parmi les connecteurs de JB, lequel est appelé en premier
- [ ] **Given** mesures 3, 4, 5, 7 **Then** rejouées au moins une fois par host web
- [ ] **Given** chaque host **Then** rapport de frictions recoupé avec le journal
- [ ] **Given** `docs/bench/results-proto.md` **Then** complet : grilles par host et modèle, golden queries, frictions, chiffres des sept mesures, et une section « Changements proposés » aux deux docs d'architecture (chacun : section visée, texte actuel, texte proposé, mesure qui le justifie) ; les docs Claude ne sont pas modifiés
- [ ] **Given** la fin de campagne **Then** connecteurs de test retirés des comptes de JB s'il le demande, phrase retirée des préférences, résumé court à JB

## Implémentation

### Fichiers à modifier
- `docs/bench/results-proto.md`, `docs/proto-golden-queries.md`
- `.claude/conventions/mcp-patterns.md` seulement si une mesure contredit une règle datée (statut + date, comme en E01-S05)

### Patterns à suivre
- `mcp-patterns.md` §8 (geste de rafraîchissement par host, recoupement)

## Tests attendus

### Unit tests
- [ ] N/A (campagne)

### Integration tests
- [ ] N/A

### E2E tests
- [ ] Les runs eux-mêmes, relus au journal

## Post-implémentation

### Notes
