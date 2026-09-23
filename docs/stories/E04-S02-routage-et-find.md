# Story E04-S02 — Routage lexical et find

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, performance, testing |
| **Estimation** | M |

## Contexte

Le serveur route les intentions : `context(phrase)` doit servir les étapes complètes de la bonne procédure quand le score est net, sinon les candidats et la consigne de demander. `find` couvre la longue traîne (procédures, pages, tableaux, fonctions). Tout est lexical : plein texte Postgres et trigrammes, aucun embedding.

**Refs :**
- PRD : FR-PROTO-04 (bloc étapes), 05, 06
- Architecture : §9.4 « Routage »
- Doc fonctionnel : « Routage des intentions », « Sûreté de la reconnaissance »

## Critères d'acceptation

- [ ] **Given** la migration **Then** `proto.route(p_org, p_team, p_user, p_query, p_kind, p_limit)` rend `path, title, summary, kind, score, detail` trié par score décroissant, score dans [0, 1] ; seuls les nœuds publiés et lisibles par l'utilisateur (règle d'architecture §9.4) ; `security invoker`, exécutable par `service_role` seulement
- [ ] **Given** une phrase qui contient un synonyme du vocabulaire (« PdV », « AC ») **Then** le terme est ajouté à la requête avant le calcul
- [ ] **Given** le jeu de phrases de test `tests/integration/proto-routing.cases.ts` (phrases déclencheuses, au moins 30 paraphrases non stockées, toutes les voisines, au moins 8 phrases hors procédure) **When** routé pour `jb` **Then** (preuve 4) parmi les phrases dont les étapes sont servies, ≥ 95 % servent la bonne procédure ; aucune phrase voisine de P ne sert les étapes de P ; aucune phrase hors procédure ne sert d'étapes ; le rapport imprime précision, rappel (paraphrases servies) et exactitude du premier candidat
- [ ] **Given** la calibration **Then** seuil et écart retenus sont des constantes de `routing.ts`, avec en commentaire les chiffres du jeu de test qui les justifient
- [ ] **Given** `acme_context {phrase: "relance les devis en attente"}` **Then** le bloc 1 liste les candidats avec score et le bloc 2 contient les sections complètes de `ventes/relance_devis` (chemin, version, étapes) ; les candidats suivants restent visibles
- [ ] **Given** une phrase ambiguë ou faible **Then** aucun bloc étapes, les candidats avec score et la consigne « Ask the user which procedure they mean; do not guess. » ; sans candidat, « No procedure matches. Say so instead of guessing; acme_find can search pages, tables and functions. »
- [ ] **Given** `acme_find {ctx, query, type?}` **Then** au plus 3 candidats avec score, chemin, type et résumé ; `type: "function"` cherche le catalogue de fonctions (nom, description) dans le code ; sous le seuil de find, la consigne de demander
- [ ] **Given** `find` et `context` **Then** `structuredContent.text === content[0].text` (preuve 5)
- [ ] **Given** Vercel **Then** `acme_context` avec phrase < 1,5 s p50 sur 10 appels (journal `duration_ms`)

## Implémentation

### Fichiers à créer
- `supabase/migrations/<ts>_proto_route.sql` : `proto.route` (vocabulaire, trigrammes, lexèmes, pénalité voisines, bonus équipe et usage lus dans `proto.journal`)
- `src/proto/services/routing.ts` : `route(identity, phrase)`, décision seuil + écart, rendu des candidats et des étapes
- `src/proto/services/find.ts`
- `tests/integration/proto-routing.cases.ts`, `tests/integration/proto-routing.test.ts`

### Fichiers à modifier
- `src/proto/services/context.ts` : blocs 1 et 2 depuis `routing.ts`
- `src/proto/mcp/server.ts` : `find` branché
- `scripts/lib/proto-data.mjs` : phrases et vocabulaire ajustés pendant la calibration (jamais les paraphrases de test)

### Patterns à suivre
- `.claude/conventions/database-patterns.md` (fonctions SQL), `performance-patterns.md`
- Doc fonctionnel : seuils calibrés pour garder ≥ 95 % de bonnes reconnaissances au-dessus du seuil ; le tri fin revient au modèle

## Tests attendus

### Unit tests
- [ ] Décision seuil + écart (fonction pure de `routing.ts`)

### Integration tests
- [ ] `proto-routing.test.ts` : preuve 4, vocabulaire, find par type, blocs de context

### E2E tests
- [ ] N/A

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
