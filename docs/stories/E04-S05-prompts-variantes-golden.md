# Story E04-S05 — Prompts suggérés, variantes de mesure, golden queries proto

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | ✅ Done (2026-09-23) |
| **Priorité** | Should |
| **Référence UI** | N/A |
| **Conventions** | mcp, testing |
| **Estimation** | S |

## Contexte

Trois des sept mesures ont besoin d'un réglage côté serveur : prompts suggérés (mesure 2, capacité `prompts`), description de context avec ou sans les domaines du client (mesure 6), ton servi par context (mesure 7). Le jeu de golden queries et un script de bascule rendent les campagnes S06 et S07 rejouables.

**Refs :**
- PRD : FR-PROTO-16, 17
- Architecture : §9.4
- Doc fonctionnel : « À mesurer sur le banc avant de coder », mesures 2, 5, 6, 7

## Critères d'acceptation

- [x] **Given** l'`initialize` **Then** capacité `prompts` déclarée ; `prompts/list` rend un prompt par procédure publiée lisible avec `meta.suggested` (au moins 3 pour Acme, 1 pour Delta) : nom ASCII, titre, description = résumé ; `prompts/get` rend un message utilisateur = première phrase déclencheuse ; journalisés
- [x] **Given** `orgs.domains` renseigné **Then** la première phrase de `<prefix>_context` nomme les domaines (« Loads your work context at Acme Énergies: sales, support, energy consulting… ») ; `domains` null **Then** première phrase générique sans domaines ; les deux variantes < 1 000 caractères (preuve 8 étendue)
- [x] **Given** `profile.ton` de l'utilisateur **Then** le bloc personne le sert tel quel ; la donnée de `jb` porte une consigne observable (tutoiement et une signature fixe en fin de réponse)
- [x] **Given** `pnpm proto:set <org> <clé> <valeur>` **Then** bascule sans redéploiement : `domains` (texte ou `null`), `rules_version` (`bump`), `ton` de `jb` ; affiche l'état avant et après
- [x] **Given** `docs/proto-golden-queries.md`, créé depuis `.claude/templates/mcp-golden-queries.tmpl.md` **Then** au moins 6 directs (un par équipe Acme et un Delta, dont relance_devis avec envoi), 4 indirects dont 1 demande sans procédure (find → read → call), 3 négatifs, 2 paires Acme / Delta pour le routage entre connecteurs ; pour chacun, l'attendu au journal (outils, fonctions, ordre, confirm)
- [x] **Given** `docs/bench/protocol.md` **Then** une section « Serveur proto » : URL, connecteurs Acme et Delta, requêtes SQL sur `proto.journal` (chronologie par ctx, premier appel par conversation, confirmations, tailles), déroulé des sept mesures (prompt exact, bascule, lecture)

## Implémentation

### Fichiers à créer
- `scripts/proto-set.mjs`
- `docs/proto-golden-queries.md`

### Fichiers à modifier
- `src/proto/mcp/server.ts` (prompts), `src/proto/mcp/tools.ts` (variante domaines), `scripts/lib/proto-data.mjs` (`suggested`, `domains`, `ton`), `package.json` (`proto:set`), `docs/bench/protocol.md`
- `tests/unit/proto-tools.test.ts`, `tests/integration/proto-core.test.ts`

### Patterns à suivre
- `mcp-patterns.md` §2.3 (prompts), §8 (golden queries, geste de rafraîchissement)

## Tests attendus

### Unit tests
- [ ] Deux variantes de description de context : domaines présents ou non, < 1 000

### Integration tests
- [ ] prompts/list et prompts/get par `InMemoryTransport`

### E2E tests
- [ ] N/A

## Post-implémentation

Implémentée le 2026-09-23 par Opus, review isolée.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| listPrompts, getPrompt, promptName | `src/proto/services/prompts.ts` | Un prompt par procédure suggérée et lisible ; message = première déclencheuse |
| Handlers prompts/list, prompts/get | `src/proto/mcp/server.ts` | Capacité `prompts`, journalisés |
| proto:set | `scripts/proto-set.mjs` | Bascules domains, rules bump, ton |
| Golden queries proto | `docs/proto-golden-queries.md` | 6 directs, 4 indirects, 3 négatifs, 2 routages entre clients |
| Protocole | `docs/bench/protocol.md` §8 | Pré-requis, requêtes R1–R6, déroulé des sept mesures |

### Option plus simple écartée
Des prompts écrits en dur dans le code : écartés, le doc fonctionnel porte les prompts suggérés comme contenu de l'organisation ; ils viennent ici des procédures marquées `meta.suggested`, sans code par client. Écarté aussi : basculer les mesures par SQL à la main pendant une campagne (erreurs de saisie au pire moment).

### Notes
- La variante de description de context selon `orgs.domains` et le ton de `jb` étaient déjà en place depuis S01 ; S05 les rend basculables.
