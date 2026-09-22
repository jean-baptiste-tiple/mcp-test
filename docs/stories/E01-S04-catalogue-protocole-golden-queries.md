# Story E01-S04 — Catalogue de scénarios, seed, protocole, golden queries

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer, 4.4 Restituer |
| **Statut** | 🟢 Ready |
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

- [ ] **Given** une base avec la migration S02 **When** `pnpm bench:seed` s'exécute deux fois **Then** chaque slug du catalogue existe une seule fois, ses tools sont identiques aux deux passes (upsert par `(scenario_id, name)`), les tools absents du catalogue pour ce scénario sont supprimés, et le scénario actif n'est pas modifié
- [ ] **Given** le catalogue **When** on le liste **Then** il contient au moins : `baseline` ; `desc_len_500`, `desc_len_2k`, `desc_len_8k`, `desc_len_32k` ; `name_len_32`, `name_len_64`, `name_len_128`, `name_chars` (point, tiret, majuscules, unicode) ; `many_tools_20`, `_50`, `_100`, `_200`, `_500` ; `instr_len_0`, `_500`, `_5k`, `_20k`, `_50k` ; `server_identity` ; `schema_shape` ; `readme_instructions`, `readme_descriptions`, `readme_name_first`, `readme_gate`, `readme_ack`, `readme_hub`
- [ ] **Given** tout scénario non-baseline **When** on lit ses tools **Then** les quatre sondes (`bench_whoami`, `bench_echo`, `bench_mutate`, `bench_readme`) y sont présentes avec les mêmes descriptions que `baseline`, sauf transformation propre au scénario
- [ ] **Given** `schema_shape` **When** on lit ses tools **Then** il contient `bench_shape_deep` (objet imbriqué sur 4 niveaux, un enum, un tableau d'objets, `description` longue sur chaque propriété, `required` à chaque niveau) et `bench_shape_flat` (10 propriétés scalaires, chacune décrite), tous deux `handler = echo` ; les `many_tools_N` contiennent N tools nommés `bench_gen_001` à `bench_gen_N` avec une description courte (≤ 120 caractères) portant un seul canari
- [ ] **Given** un texte généré (description, titre, instructions, readme) **When** on le parcourt **Then** il porte exactement trois canaris `[C:<slug>:<champ>:start|middle|end:<4hex>]` placés dans le premier, le deuxième et le dernier tiers, et le reste est du texte anglais lisible (pas de lorem répété à l'identique : phrases numérotées)
- [ ] **Given** `many_tools_500` **When** `JSON.stringify(tools)` **Then** la taille reste sous 1,5 Mo (descriptions courtes dans ce scénario)
- [ ] **Given** `docs/bench/protocol.md` **When** JB le suit **Then** pour chaque host il a : pré-requis de connexion, la liste des mutations (tool créé, description, schéma, tool désactivé, instructions, serverInfo), l'échelle d'actions, les prompts exacts (whoami, canaris, readme), et les requêtes SQL d'analyse (dernier `tools/list` par empreinte, readme avant premier autre tool, taille servie par scénario)
- [ ] **Given** `docs/bench/results.md` **When** on l'ouvre **Then** la grille host × mutation, la grille des seuils, et la grille des leviers readme existent, vides, avec les colonnes date et `client_name@client_version`
- [ ] **Given** `docs/mcp-golden-queries.md` **Then** au moins 3 prompts directs, 3 indirects, 2 négatifs visant les sondes

## Implémentation

### Fichiers à créer
- `scripts/lib/catalogue.mjs` : `buildCatalogue(): Scenario[]` pur et déterministe (seed PRNG fixe pour les hex des canaris) ; `canary(slug, field, pos, rng)` ; `fillText(slug, field, targetChars, rng)`
- `scripts/bench-seed.mjs` : charge `.env.local` (lecture manuelle du fichier, sans dépendance), client `@supabase/supabase-js` avec `SUPABASE_SECRET_KEY`, upsert scénarios par slug (sans toucher `is_active`), upsert tools par `(scenario_id, name)`, suppression des tools orphelins du scénario, résumé en sortie
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

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
