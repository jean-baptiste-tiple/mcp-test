# Story E01-S04 — Catalogue de scénarios, seed, protocole, golden queries

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer, 4.4 Restituer |
| **Statut** | ✅ Done (2026-09-22) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, testing |
| **Estimation** | M |

## Contexte

Les scénarios sont des données : cette story fournit le catalogue générateur (avec canaris), le script qui le pousse en base de façon idempotente, le protocole manuel que JB suit sur chaque host, la grille de résultats vide et les golden queries des sondes. Le code de cette story (script et catalogue) est indépendant de S03 : il n'écrit que des lignes. Les documents `docs/bench/*.md` et `docs/mcp-golden-queries.md` sont rédigés par le pilote (Fable), le catalogue et le script par l'agent.

**Refs :**
- PRD : FR-PILOT-02, FR-OBS-04 (canaris), FR-REST-01, FR-REST-02, FR-REST-04
- Architecture : section 3 (`scripts/`), section 4 (tables), point d'attention n°5 (taille de tools/list)

## Critères d'acceptation

- [x] **Given** une base avec la migration S02 **When** `pnpm bench:seed` s'exécute deux fois **Then** chaque slug du catalogue existe une seule fois, ses tools sont identiques aux deux passes (upsert par `(scenario_id, name)`), les tools absents du catalogue pour ce scénario sont supprimés, et le scénario actif n'est pas modifié
- [x] **Given** le catalogue **When** on le liste **Then** il contient au moins : `baseline` ; `desc_len_500`, `desc_len_2k`, `desc_len_8k`, `desc_len_32k` ; `name_len_32`, `name_len_64`, `name_len_128`, `name_chars` (point, tiret, majuscules, unicode) ; `many_tools_20`, `_50`, `_100`, `_200`, `_500` ; `instr_len_0`, `_500`, `_5k`, `_20k`, `_50k` ; `server_identity` ; `schema_shape` ; `readme_instructions`, `readme_descriptions`, `readme_name_first`, `readme_gate`, `readme_ack`, `readme_hub`
- [x] **Given** tout scénario, `baseline` compris **When** on lit ses tools **Then** les quatre sondes (`bench_whoami`, `bench_echo`, `bench_mutate`, `bench_readme`) y sont présentes, **clonées par le script depuis `scripts/lib/probes.mjs`** (source unique : name, title, description, input_schema, annotations, handler, sort_order) ; le seed restaure ainsi `baseline` (sondes, instructions, readme, version) après une campagne qui l'a muté, sans jamais toucher `is_active`. Les migrations S02/S03 ne sont qu'un amorçage historique (révision après la review S04 : cloner depuis les lignes vivantes de `baseline` aurait propagé une mutation de test dans tous les scénarios)
- [x] **Given** `schema_shape` **When** on lit ses tools **Then** il contient `bench_shape_deep` (objet imbriqué sur 4 niveaux, un enum, un tableau d'objets, `description` longue sur chaque propriété, `required` à chaque niveau) et `bench_shape_flat` (10 propriétés scalaires, chacune décrite), tous deux `handler = echo` ; les `many_tools_N` contiennent N tools nommés `bench_gen_001` à `bench_gen_N` avec une description courte (≤ 120 caractères) portant un seul canari
- [x] **Given** un texte généré (description, titre, instructions, readme) **When** on le parcourt **Then** il porte exactement trois canaris `[C:<slug>:<champ>:start|middle|end:<4hex>]` placés dans le premier, le deuxième et le dernier tiers, et le reste est du texte anglais lisible (pas de lorem répété à l'identique : phrases numérotées)
- [x] **Given** `many_tools_500` **When** `JSON.stringify(tools)` **Then** la taille reste sous 1,5 Mo (descriptions courtes dans ce scénario)
- [x] **Given** `docs/bench/protocol.md` **When** JB le suit **Then** pour chaque host il a : pré-requis de connexion, la liste des mutations (tool créé, description, schéma, tool désactivé, instructions, serverInfo), l'échelle d'actions, les prompts exacts (whoami, canaris, readme), et les requêtes SQL d'analyse (dernier `tools/list` par empreinte, readme avant premier autre tool, taille servie par scénario)
- [x] **Given** `docs/bench/results.md` **When** on l'ouvre **Then** la grille host × mutation, la grille des seuils, et la grille des leviers readme existent, vides, avec les colonnes date et `client_name@client_version`
- [x] **Given** `docs/mcp-golden-queries.md` **Then** au moins 3 prompts directs, 3 indirects, 2 négatifs visant les sondes

## Implémentation

### Fichiers à créer
- `scripts/lib/probes.mjs` : `PROBES` (les 4 sondes, textes identiques aux migrations) et `BASELINE` (champs du scénario) — source unique ; toute évolution d'une sonde se fait ici puis `pnpm bench:seed`
- `scripts/lib/catalogue.mjs` : `buildCatalogue(): Scenario[]` pur et déterministe (seed PRNG fixe pour les hex des canaris) ; `canary(slug, field, pos, rng)` ; `fillText(slug, field, targetChars, rng)` ; `baseline` inclus (0 tool généré) ; les scénarios `readme_*` ne diffèrent de `baseline` que par `readme_lever`, `ack_ttl_seconds` et `readme_content` ; descriptions générées au format « … Use this when … Do not use for … » (mcp-patterns §3) pour ne mesurer qu'une variable à la fois
- `scripts/bench-seed.mjs` : charge `.env.local` (lecture manuelle du fichier, sans dépendance), client `@supabase/supabase-js` avec `SUPABASE_SECRET_KEY`, upsert scénarios par slug (jamais `is_active`), upsert tools par `(scenario_id, name)` = tools générés + les 4 sondes de `probes.mjs`, suppression des tools orphelins du scénario (filtrée par `scenario_id`), résumé en sortie. Idempotent : deux passes, aucune écriture à la seconde
- `tests/unit/bench-catalogue.test.ts` : importe `scripts/lib/catalogue.mjs`
- `docs/bench/protocol.md`, `docs/bench/results.md`, `docs/mcp-golden-queries.md` (pilote)

### Fichiers à modifier
- `package.json` : script `bench:seed` (`node scripts/bench-seed.mjs`)
- `README.md` : section « Scénarios » (seed, activation dans Studio)

### Patterns à suivre
- `.claude/conventions/mcp-patterns.md` §3 (les sondes gardent le format « Use this when… »), §8 (golden queries)
- Le script ne doit jamais désactiver ou activer un scénario : l'activation reste un geste explicite dans Studio ou par SQL

## Tests attendus

### Unit tests
- [ ] `bench-catalogue.test.ts` : slugs attendus présents ; sondes présentes partout ; noms uniques par scénario ; canaris au bon format et aux bonnes positions ; longueurs cibles respectées à ±5 % ; `many_tools_500` sous le plafond ; déterminisme (deux appels identiques)

### Integration tests
- [ ] Aucun (le seed s'exécute contre la base réelle, vérifié manuellement par les AC 1 et 2)

### E2E tests
- [ ] N/A

## Post-implémentation

Code implémenté le 2026-09-22 par un agent Opus en parallèle de S03 (fichiers disjoints) ; docs (`protocol.md`, `results.md`, `mcp-golden-queries.md`) rédigés par le pilote en amont, complétés par la dimension « modèle » (tag `note` de `bench_whoami`, grille D par levier × modèle).

### Écarts avec l'architecture
- Première version : sondes clonées depuis les lignes vivantes de `baseline`, `baseline` hors catalogue. **Rejetée par la review (HAUTE)** : la grille B mute `baseline` par conception, une mutation de test serait partie dans les 26 scénarios, et la restauration promise par le protocole n'existait pas. Version retenue : `scripts/lib/probes.mjs` = source unique des 4 sondes et des champs de `baseline` ; `baseline` est dans le catalogue et restauré par le seed comme les autres (jamais `is_active`). Les migrations S02/S03 restent un amorçage historique (doublon assumé, la base est réécrite par le seed).
- Le seed n'écrit pas `enabled` : un tool désactivé à la main par `bench_mutate` reste désactivé après un seed (voulu : le seed ne défait pas une désactivation de test ; `enable_tool` ou Studio pour la lever).
- Descriptions générées au format mcp-patterns §3 (phrase d'amorce « Use this when… Do not use for… ») pour que les scénarios de longueur ne fassent varier qu'une variable.
- Déclaration de types en `scripts/lib/catalogue.d.mts` (TypeScript mappe un import `.mjs` sur `.d.mts`, pas `.d.ts`) ; `tsconfig.json` inchangé.
- Chunking : inserts par 200, deletes par 50 (`.in("id", …)` passe les uuid dans l'URL).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| PROBES, BASELINE | `scripts/lib/probes.mjs` | Source unique des 4 sondes et des champs du scénario `baseline` |
| buildCatalogue, canary, fillText | `scripts/lib/catalogue.mjs` (+ `.d.mts`) | 27 scénarios (`baseline` compris), ~880 tools générés, PRNG mulberry32 seedé par slug, déterministe |
| bench-seed | `scripts/bench-seed.mjs` | `pnpm bench:seed` : lit `.env.local` à la main, upsert par diff des scénarios et des tools (sondes depuis `probes.mjs`), suppression des orphelins du scénario, jamais `is_active` ; restaure `baseline` |

### Option plus simple écartée
Readme généré par simple concaténation règles + `fillText` : le canari `start` tombait à ~31 % du texte, à une phrase de sortir du premier tiers ; l'option `lead` fait entrer les règles dans le calcul des tiers (mesuré 16,5 %). Aussi écarté : aucun fichier de déclaration (callbacks du test annotés à la main) ; `input_schema` restait `any` et le test de `schema_shape` perdait tout typage.

### Notes
- Avant la révision, les fonctions d'écriture ont été exercées sur la base réelle avec un scénario jetable (création, idempotence, mise à jour + orphelin, 250 tools, 245 suppressions, `is_active` inchangé), supprimé ensuite.
- Seed réel exécuté après S03 : passe 1 = 26 scénarios créés + `baseline` inchangé (27), 987 tools insérés ; passe 2 = aucune écriture ; contrôle en base : `baseline` seul actif avec ses 4 sondes (`version = 1`, non réécrites), `many_tools_500` = 504 tools. `PROBES` et `BASELINE` vérifiés octet par octet contre les lignes écrites par les migrations.
- Métriques : textes longs à ±0 % de la cible, 3 canaris toujours dans les bons tiers ; `many_tools_500` = 188 001 caractères (plafond 1,5 Mo).
