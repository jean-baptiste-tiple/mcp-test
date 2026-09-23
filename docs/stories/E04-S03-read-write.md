# Story E04-S03 — read et write : plan, sections, révisions, brouillon et publication

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, security, testing |
| **Estimation** | L |

## Contexte

Le modèle ne lit et n'écrit que le morceau utile : plan, section adressée par son titre, changements depuis une révision ; il écrit par opérations, en brouillon, puis publie. Une écriture calculée sur une révision périmée est refusée avec l'état actuel. Publier le guide de l'organisation change les règles : la version des règles monte et invalide les ctx en cours.

**Refs :**
- PRD : FR-PROTO-07, 08, 13
- Architecture : §9.3 (nodes, node_versions), §9.4 (contrat, droits)
- Doc fonctionnel : « Arbre, pages et procédures », « Lire et écrire à moindre coût »

## Critères d'acceptation

- [ ] **Given** `acme_read {ctx, path: "conseil/methode_etude"}` (page de plus de 12 000 caractères) **Then** en-tête (titre, résumé, chemin, type, statut, révision, date, équipe) et plan (une ligne par section avec sa taille), jamais le corps entier ; une page sous le plafond `READ_MAX_CHARS` (12 000, constante) est rendue entière
- [ ] **Given** `section: "Dimensionnement"` **Then** cette section seule ; titre inconnu **Then** `isError` qui liste les titres existants
- [ ] **Given** `since_revision: n` **Then** seulement les sections ajoutées, modifiées ou supprimées depuis n, d'après `node_versions`
- [ ] **Given** `path` = nom d'une fonction du catalogue (`sellsy.list_estimates`) **Then** son contrat : description, classe, schéma JSON des arguments, exemples, refus possibles (S04 fournit le catalogue ; tant qu'il manque, S03 lit un catalogue vide et renvoie « unknown function »)
- [ ] **Given** un tableau **Then** en-tête, colonnes, clé, colonne d'état, nombre de lignes, et la consigne d'utiliser `table.rows` par `acme_call`
- [ ] **Given** un nœud d'une équipe dont l'utilisateur n'est pas membre (non admin) **Then** refus nommant l'équipe et son responsable
- [ ] **Given** `acme_write {ctx, path: nouveau, kind: "page", title, summary, ops: [{op: "add_section", section: "Contexte", text}]}` **Then** nœud créé en brouillon, révision 0, texte « Draft saved… publish with publish: true » ; résumé > 200 caractères **Then** refus avec la limite
- [ ] **Given** un nœud publié en révision r **When** `write {base_revision: r, ops: [{op: "replace_section", section: "Étapes", text}]}` **Then** brouillon mis à jour, sections touchées listées ; opérations disponibles : `replace_section`, `append` (à la fin d'une section), `add_section` (avec `after?`), `delete_section`, `replace_text` (`find` exact et unique dans la section)
- [ ] **Given** `base_revision` ≠ révision courante, ou absente sur un nœud existant **Then** (preuve 6) refus « stale revision » avec la révision courante et le plan actuel ; rien n'est écrit
- [ ] **Given** `publish: true` **Then** révision + 1, ligne `node_versions`, brouillon vidé ; pour une procédure, `triggers` et `neighbors` du brouillon remplacent ses phrases
- [ ] **Given** la publication du nœud `guide` **Then** `orgs.rules_version` + 1 : l'appel suivant d'un ctx antérieur reçoit « context has changed, call acme_context again » (preuve 2 par le produit)
- [ ] **Given** un utilisateur sans droit d'écriture **Then** refus nommant le responsable
- [ ] **Given** read et write **Then** `structuredContent.text === content[0].text` (preuve 5)

## Implémentation

### Fichiers à créer
- `src/proto/services/read.ts`, `src/proto/services/write.ts`
- `tests/integration/proto-read-write.test.ts`

### Fichiers à modifier
- `src/proto/mcp/server.ts` : `read` et `write` branchés
- `src/proto/services/context.ts` : nouveautés lues dans `node_versions` si S01 les calcule autrement

### Patterns à suivre
- `coding-standards.md` §Patchs partiels ; `mcp-patterns.md` §4 ter (deltas adressés par nom)
- Écriture en deux temps, lecture de la révision puis update conditionnel (`eq("revision", r)`) : la garde tient sous concurrence

## Tests attendus

### Unit tests
- [ ] Application des opérations sur une liste de sections (fonction pure) : chaque op, titre inconnu, `find` absent ou ambigu

### Integration tests
- [ ] `proto-read-write.test.ts` : plan, section, since_revision, contrat de fonction, tableau, droits, création, preuve 6, publication, guide → preuve 2, preuve 5

### E2E tests
- [ ] N/A

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
