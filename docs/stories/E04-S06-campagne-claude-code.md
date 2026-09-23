# Story E04-S06 — Campagne Claude Code headless

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, testing |
| **Estimation** | M |

## Contexte

Claude Code se pilote sans navigateur ni compte : `claude -p` avec une config MCP qui branche Acme et Delta, un modèle par run. Cette campagne joue les preuves 9 à 11 et les mesures qui ne dépendent pas des comptes de JB (3, 4, 5, 7, et l'équivalent de 1 par `--append-system-prompt`), sur Opus 5.5, Sonnet 5 et Fable 5.1.

**Refs :**
- PRD : FR-PROTO-17, critères « hosts » du parcours 4.5
- `docs/bench/protocol.md` (section « Serveur proto » ajoutée en S05), `docs/proto-golden-queries.md`
- Pièges E01 : Claude Code ne montre que `structuredContent` quand il existe, coupe descriptions et instructions à 2 048 caractères, et il faut une nouvelle session pour voir un changement

## Critères d'acceptation

- [x] **Given** chaque modèle **When** chaque golden query est jouée dans une session neuve (sans nommer le connecteur) **Then** la grille note : premier appel = `<prefix>_context` (preuve 9), procédure servie et suivie, nombre d'appels avant la première action, accord demandé avant `mail.send_draft` (preuve 10 : au journal, un appel sans `confirm` puis, seulement si l'utilisateur simulé accepte au tour suivant, un appel avec), bon préfixe entre Acme et Delta
- [x] **Given** la demande sans procédure **Then** `find`, `read` puis `call` avec des arguments valides (preuve 11, journal `is_error = false`)
- [x] **Given** mesure 3 **Then** `probe.payload` à 10 000, 25 000, 50 000, 100 000, 200 000 caractères : dernier canari cité par le modèle, troncature éventuelle annoncée par Claude Code
- [x] **Given** mesure 4 **Then** `probe.echo` avec des textes demandés de 2 000, 8 000, 20 000, 50 000 caractères : `args_chars` reçus au journal
- [x] **Given** mesure 5 **Then** dans une session à deux tours, `pnpm proto:set acme rules_version bump` entre les deux : le modèle rappelle-t-il context de lui-même, en combien d'appels
- [x] **Given** mesure 7 **Then** la consigne de ton de `jb` est-elle suivie (tutoiement, signature) sur 3 réponses par modèle
- [x] **Given** mesure 1 (équivalent Claude Code) **Then** avec et sans la phrase générique en `--append-system-prompt`, sur une demande qui ne nomme pas le connecteur
- [x] **Given** chaque modèle **Then** rapport de frictions (P15 adapté au serveur proto) recoupé avec le journal
- [x] **Given** les runs **Then** `docs/bench/results-proto.md` créé : empreintes, grille Claude Code par modèle, chiffres des mesures 3, 4, 5, 7 et 1-CC, frictions ; chaque fait cite sa requête SQL

## Implémentation

### Fichiers à créer
- `docs/bench/results-proto.md`
- Scripts de run dans le scratchpad (non versionnés, comme en E01) ; la config MCP et les commandes exactes sont recopiées dans results-proto.md

### Fichiers à modifier
- `docs/proto-golden-queries.md` (journal des révisions si une description change)

### Patterns à suivre
- `mcp-patterns.md` §8 (rapport de frictions, recoupement journal)
- Modèles : `--model` avec les identifiants Opus 5.5, Sonnet 5, Fable 5.1

## Tests attendus

### Unit tests
- [ ] N/A (campagne)

### Integration tests
- [ ] N/A

### E2E tests
- [ ] Les runs eux-mêmes, relus au journal

## Post-implémentation

Jouée le 2026-09-23 (13:50–14:30) par Fable (pilote), ~90 runs `claude -p` sur Opus 5.5, Sonnet 5 et Fable 5.1 ; résultats dans `docs/bench/results-proto.md`.

### Écarts
- Mesure 6 (domaines face aux autres connecteurs) non mesurable en headless : seuls Acme et Delta sont branchés. Mesurée indirectement par le routage Acme / Delta (6/6 justes, ambigu posé en question 3/3).
- Mesure 1 sans effet sur Claude Code : `context` est déjà premier 39/39 sans la phrase.
- D4 rejoué après correction des données (`scripts/lib/proto-data.mjs`, étape 5 de `ventes/qualifier_prospects` : retour « à traiter » au lieu de « en cours », état que le serveur réserve à `claim` depuis la review S04). Le nœud a été mis à jour en base sans reseed pour garder le journal ; `pnpm proto:seed` avant S07.
- CLI Claude Code mis à jour 2.1.263 → 2.1.280 (Opus 5.5 refusé avant).

### Option plus simple écartée
Jouer les prompts à la main dans une session interactive : écarté, 90 runs sur trois modèles, et le flux `stream-json` donne la séquence d'appels exacte à recouper avec le journal.

### Notes
- Scripts de campagne dans le scratchpad de la session (`cc/batch.mjs`, `gen-plans.mjs`, `analyze.mjs`, `mcp.json`), non versionnés comme en E01 ; la config et les commandes sont recopiées dans results-proto.md.
- Trois interruptions du host sur ~90 runs (classifieur, filtre de sécurité, garde-fous Sonnet sur les canaris), aucune liée au serveur.
