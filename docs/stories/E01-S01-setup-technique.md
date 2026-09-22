# Story E01-S01 — Setup technique : starter MCP sans widgets, Supabase, migrations

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer |
| **Statut** | ✅ Done (2026-09-22) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, deploy, testing |
| **Estimation** | M |

## Contexte

Le dépôt est le template Tiple nu : pas de dépendance MCP ni Supabase, scripts `db:*` en placeholder. Cette story installe le squelette minimal sur lequel S02 branche la base : endpoint `/api/mcp` fonctionnel avec le tool démo du starter, client Supabase serveur, outillage de migrations, smoke test. Widgets, auth OAuth et jose ne sont pas installés (ADR-002).

**Refs :**
- PRD : parcours 4.1, 4.2 (prérequis de FR-PILOT-01, FR-OBS-01)
- Architecture : sections 2, 3, 8 ; ADR-001, ADR-002
- Starter : `.claude/starters/mcp/README.md` (sans la partie widgets ni auth), `.claude/starters/supabase-auth/README.md` (uniquement `supabase/config.toml`)

## Critères d'acceptation

- [x] **Given** le dépôt après install **When** `pnpm type-check`, `pnpm lint`, `pnpm test` s'exécutent **Then** les trois passent, le test `tests/unit/mcp-server.test.ts` compris
- [x] **Given** `pnpm build` puis `pnpm start` **When** `pnpm mcp:smoke http://localhost:3000/api/mcp` s'exécute **Then** il affiche `initialize` OK (serverInfo `mcp-bench`), `tools/list` contenant `get_status`, et l'appel `get_status` OK
- [x] **Given** `.env.local` **When** `pnpm db:push` s'exécute **Then** la CLI Supabase se connecte au projet `nwdmkehnxvqyxddgogtu` et rapporte « aucune migration à appliquer » (aucune migration dans cette story)
- [x] **Given** `pnpm db:types` **When** il s'exécute **Then** `src/types/database.ts` est généré (vide de tables à ce stade) et type-check passe
- [x] **Given** `src/lib/supabase/admin.ts` **When** on l'importe depuis un fichier client (`"use client"`) **Then** le module `server-only` fait échouer le build (garde contre la fuite de la clé)
- [x] **Given** `tech-stack.md` **When** la story est close **Then** les versions exactes installées y figurent

## Implémentation

### Dépendances
- `pnpm add mcp-handler @modelcontextprotocol/sdk@<peer de mcp-handler> @supabase/supabase-js server-only`
- `pnpm add -D supabase`
- Ne PAS installer : jose, @modelcontextprotocol/ext-apps, vite, vite-plugin-singlefile, @supabase/ssr.

### Fichiers à créer
- `src/app/api/[transport]/route.ts` ← `.claude/starters/mcp/mcp-route.ts` (stateless, bloc auth laissé commenté)
- `src/mcp/config.ts` ← starter `config.ts` ; `MCP_SERVER_INFO = { name: "mcp-bench", title: "MCP Bench", version: "0.1.0" }` ; retirer `supabaseIssuer` et `MCP_SCOPES_SUPPORTED` (phase 3)
- `src/mcp/server.ts` ← starter `server.ts` sans `registerWidgets` ni capability `resources` ; instructions provisoires « MCP Bench: test server. Call get_status. »
- `src/mcp/tool-result.ts` ← starter `tool-result.ts` (retirer les références widget)
- `src/mcp/tools/get-status.ts`, `src/lib/schemas/status.ts`, `src/lib/services/status-service.ts` ← starter (démo, retirés en S02)
- `src/lib/supabase/admin.ts` : `import "server-only"` ; `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })` ; erreur explicite si une variable manque
- `scripts/smoke-mcp.mjs` ← starter (URL en argument, défaut `http://localhost:3000/api/mcp`)
- `tests/unit/mcp-server.test.ts` ← starter, réduit : initialize (serverInfo, instructions), tools/list contient `get_status`, appel `get_status` renvoie `content` texte + `structuredContent`
- `supabase/config.toml` ← starter supabase-auth `supabase-config.toml` (project_id `nwdmkehnxvqyxddgogtu`)
- `supabase/migrations/.gitkeep`

### Fichiers à modifier
- `package.json` : scripts `mcp:smoke`, `mcp:inspect`, `db:migrate` (`supabase migration new`), `db:push` (`supabase db push`), `db:types` (`supabase gen types typescript --project-id nwdmkehnxvqyxddgogtu --schema public > src/types/database.ts`), `db:reset` retiré
- `.env.example` : bloc Supabase décommenté avec les noms réels, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `BENCH_ACK_SECRET` (S03)
- `.claude/conventions/tech-stack.md` : versions exactes
- `README.md` : section « MCP Bench » (ce que c'est, ADR-002, comment lancer le smoke)

### Patterns à suivre
- `.claude/conventions/mcp-patterns.md` §7 (stateless), §10 (tests InMemoryTransport, smoke)
- `.claude/conventions/database-patterns.md` (migrations)
- Pièges du starter : route dans `api/[transport]` et PAS `api/mcp/[transport]`

### Actions JB (hors code)
- Variables Vercel production : `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (nécessaires à partir de S02). `NEXT_PUBLIC_SITE_URL` et `MCP_RESOURCE_URL` retirées du périmètre (aucun code ne les lit avant E03).

## Tests attendus

### Unit tests
- [ ] `tests/unit/mcp-server.test.ts` : initialize renvoie `serverInfo.name = "mcp-bench"` et des instructions non vides ; tools/list contient `get_status` ; `get_status` renvoie texte et structuredContent

### Integration tests
- [ ] Aucun (le smoke HTTP couvre la route)

### E2E tests
- [ ] N/A

## Post-implémentation

Implémentée le 2026-09-22 par un agent Opus (pilote Fable), deux reviews isolées (8 MOYENNE corrigées à la première).

### Écarts avec l'architecture
- `mcp-handler` épinglé en **1.1.0** avec `@modelcontextprotocol/sdk` **1.26.0** exact : `pnpm add mcp-handler` installe 2.2.0 dont le peer est le SDK v2 scindé (`@modelcontextprotocol/server`), incompatible avec le starter et les conventions. Passer en 2.x = décision séparée (tech-stack.md).
- `capabilities.tools.listChanged` (ADR-001 §Neutres) n'est pas déclaré : le SDK le déclare lui-même au premier `registerTool`. S02 le déclarera explicitement puisqu'il pose des handlers bas niveau sans `registerTool`.
- `MCP_RESOURCE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_ID` retirés (aucun consommateur en phase 1) ; architecture §3 et §8 alignés. Reviennent avec E03.
- `tool-meta.ts` non copié (`securitySchemes` exclu par ADR-002 §4) ; `supabase/config.toml` réduit à `project_id` (pas de stack locale).
- `type-check` = `next typegen && tsc --noEmit` : Next 15.5 fait référencer `.next/types/routes.d.ts` par `next-env.d.ts`, absent sur un clone neuf. `db:types` utilise `--linked` (plus de ref de projet en dur).
- `pnpm-workspace.yaml` inchangé : `supabase` 2.117.0 n'a plus de postinstall (binaire en `optionalDependencies`), `onlyBuiltDependencies` aurait été une surface morte.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| getAdminClient | `src/lib/supabase/admin.ts` | Clé secrète, `server-only`, mémoïsé, typé `Database`. Ajouté au registry |
| Chaîne démo get_status | `src/mcp/tools/get-status.ts`, `src/lib/schemas/status.ts`, `src/lib/services/status-service.ts`, `src/mcp/tool-result.ts` | Retirée en S02 (chaque fichier le dit en tête) |
| smoke-mcp | `scripts/smoke-mcp.mjs` | initialize + tools/list + appel de tool, échoue sur `isError` |

### Option plus simple écartée
Route nue sans tool démo (smoke limité à `initialize`). Rejeté : `tools/list` et `tools/call` n'auraient pas été vérifiés de bout en bout alors que les AC 1 et 2 les nomment ; le coût est de 4 fichiers à supprimer en S02, qui servent de gabarit vérifié aux handlers du banc. Sous-option écartée : route sur le SDK nu sans `mcp-handler` ; rejeté car le starter, mcp-patterns §7 et la création par requête de S02 s'appuient sur `mcp-handler` (le SDK nu reste le repli noté en architecture, point d'attention n°1).

### Notes
- Smoke contre `pnpm start` : `initialize` → serverInfo `{"name":"mcp-bench","title":"MCP Bench","version":"0.1.0"}`, `tools/list` → 1 tool, `get_status` → OK. `pnpm db:push` → « Remote database is up to date ». Garde `server-only` vérifiée : import depuis un composant client → `Error: You're importing a component that needs "server-only"` au build.
- CLI Supabase branchée une fois par `supabase login --token` + `supabase link --project-ref … --password …` (`supabase/.temp/` ignoré). README documente sans valeurs.
- BASSE écartées car portées par la chaîne démo supprimée en S02 : nommage `GetStatusInput` (conflit coding-standards §Naming `xxxSchema` vs mcp-patterns §1 `<Tool>Input`, à trancher au wrap-up), ordre d'imports du service, `catch` sans `console.error`, service important `@/mcp/config` (inversion de couches : `src/mcp/bench/*` importe `lib/`, jamais l'inverse en S02), `outputSchema`, assertions `verbose`.
- `next-env.d.ts` modifié par Next (référence `routes.d.ts`) : commité, cohérent avec `next typegen` dans `type-check`.
