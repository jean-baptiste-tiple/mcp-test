# Story E04-S03 — read et write : plan, sections, révisions, brouillon et publication

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | ✅ Done (2026-09-23) |
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

- [x] **Given** `acme_read {ctx, path: "conseil/methode_etude"}` (page de plus de 12 000 caractères) **Then** en-tête (titre, résumé, chemin, type, statut, révision, date, équipe) et plan (une ligne par section avec sa taille), jamais le corps entier ; une page sous le plafond `READ_MAX_CHARS` (12 000, constante) est rendue entière
- [x] **Given** `section: "Dimensionnement"` **Then** cette section seule ; titre inconnu **Then** `isError` qui liste les titres existants
- [x] **Given** `since_revision: n` **Then** seulement les sections ajoutées, modifiées ou supprimées depuis n, d'après `node_versions`
- [x] **Given** `path` = nom d'une fonction du catalogue (`sellsy.list_estimates`) **Then** son contrat : description, classe, schéma JSON des arguments, exemples, refus possibles (S04 fournit le catalogue ; tant qu'il manque, S03 lit un catalogue vide et renvoie « unknown function »)
- [x] **Given** un tableau **Then** en-tête, colonnes, clé, colonne d'état, nombre de lignes, et la consigne d'utiliser `table.rows` par `acme_call`
- [x] **Given** un nœud d'une équipe dont l'utilisateur n'est pas membre (non admin) **Then** refus nommant l'équipe et son responsable
- [x] **Given** `acme_write {ctx, path: nouveau, kind: "page", title, summary, ops: [{op: "add_section", section: "Contexte", text}]}` **Then** nœud créé en brouillon, révision 0, texte « Draft saved… publish with publish: true » ; résumé > 200 caractères **Then** refus avec la limite
- [x] **Given** un nœud publié en révision r **When** `write {base_revision: r, ops: [{op: "replace_section", section: "Étapes", text}]}` **Then** brouillon mis à jour, sections touchées listées ; opérations disponibles : `replace_section`, `append` (à la fin d'une section), `add_section` (avec `after?`), `delete_section`, `replace_text` (`find` exact et unique dans la section)
- [x] **Given** `base_revision` ≠ révision courante, ou absente sur un nœud existant **Then** (preuve 6) refus « stale revision » avec la révision courante et le plan actuel ; rien n'est écrit
- [x] **Given** `publish: true` **Then** révision + 1, ligne `node_versions`, brouillon vidé ; pour une procédure, `triggers` et `neighbors` du brouillon remplacent ses phrases
- [x] **Given** la publication du nœud `guide` **Then** `orgs.rules_version` + 1 : l'appel suivant d'un ctx antérieur reçoit « context has changed, call acme_context again » (preuve 2 par le produit)
- [x] **Given** un utilisateur sans droit d'écriture **Then** refus nommant le responsable
- [x] **Given** read et write **Then** `structuredContent.text === content[0].text` (preuve 5)

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

Implémentée le 2026-09-23 par Opus avec S04, review isolée commune (0 HAUTE, 5 MOYENNE corrigées).

### Écarts avec l'architecture
- Le résumé de plus de 200 caractères est refusé par le schéma Zod de l'outil (message « Too big »), pas par le service.
- Le brouillon et la publication sont gardés par la révision ET par `updated_at` : enregistrer un brouillon ne change pas la révision, deux brouillons concurrents s'écraseraient sinon.
- Publication non transactionnelle (nœud, version, phrases, version des règles) : un échec entre deux étapes est possible, noté comme dette de maquette.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| read, READ_MAX_CHARS | `src/proto/services/read.ts` | Plan au-delà de 12 000 caractères, section, since_revision, contrat de fonction, tableau |
| write, GUIDE_PATH | `src/proto/services/write.ts` | Création en brouillon, garde de révision, publication, phrases de procédure, version des règles |
| applyOps, findSection, sameTitle | `src/proto/services/sections.ts` | Opérations par section adressée par son titre (fonctions pures) |
| canWrite, describeTeam | `src/proto/identity.ts` | Règle d'écriture, équipe et responsable nommés dans les refus |

### Option plus simple écartée
Remplacer la page entière à chaque écriture (un seul champ `sections`) : écarté, le modèle devrait relire et renvoyer toute la page, ce que la règle des deltas (mcp-patterns §4 ter) interdit. Écarté aussi : écrire directement la version publiée, sans brouillon ; le doc fonctionnel demande brouillon puis publication.

### Notes
- Preuve 6 (write) : révision absente ou périmée refusée avec la révision et le plan actuels, rien d'écrit. Preuve 2 par le produit : publier `guide` invalide les ctx en cours.
- Review : M1 brouillon concurrent (garde `updated_at`), B1 `replace` sans motifs `$`. Non traités (notés) : section seule sans plafond de taille, écriture acceptée sur un nœud tableau, `kind` ignoré sur un nœud existant, refus d'un nœud d'organisation qui nomme « the organisation admins ».
