# Story E01-S02 — Registre de tools en base et journal des requêtes

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, security, typescript, testing |
| **Estimation** | L |

## Contexte

Cœur du banc : les tools, instructions et serverInfo viennent de la base à chaque requête, et chaque requête JSON-RPC est journalisée. Cette story remplace le tool démo `get_status` par le registre piloté par `bench_scenarios` et `bench_tools`, avec un handler générique `echo`, et pose le journal `bench_events`. Les sondes whoami, mutate et readme arrivent en S03 ; cette story doit laisser un point d'extension (dispatch par `handler`).

**Refs :**
- PRD : FR-PILOT-01, FR-PILOT-04, FR-OBS-01, FR-OBS-03, FR-OBS-04, FR-OBS-05, NFR-PILOT-01, NFR-OBS-01, NFR-OBS-02
- Architecture : sections 4 (tables, RLS), 6 (cycle d'une requête, points d'attention 1 à 4) ; ADR-001, ADR-002

## Critères d'acceptation

- [ ] **Given** la migration appliquée **When** on inspecte le schéma **Then** les tables `bench_scenarios`, `bench_tools`, `bench_events` existent avec les colonnes, checks, FK cascade, index unique partiel sur `is_active`, index listés en architecture §4, RLS activé et aucune policy
- [ ] **Given** un scénario actif avec 3 tools activés et 1 désactivé (repository mémoire) **When** un client `InMemoryTransport` appelle `tools/list` **Then** exactement les 3 tools activés, dans l'ordre `sort_order`, avec name, title, description, inputSchema et annotations des lignes
- [ ] **Given** aucun scénario actif **When** `initialize` puis `tools/list` **Then** serverInfo `mcp-bench` version `0.0.0`, instructions « No active scenario », liste vide, aucune erreur
- [ ] **Given** un tool `handler = echo` **When** il est appelé avec `{message: "x", extra: 1}` **Then** `content[0].text` est la sérialisation JSON exacte des arguments et `structuredContent.args` les contient ; avec plus de 64 ko d'arguments **Then** `isError` avec message actionnable
- [ ] **Given** un tool inconnu **When** `tools/call` **Then** `isError` avec « Unknown tool <name>. Call tools/list to refresh. » (pas d'exception)
- [ ] **Given** une requête HTTP `initialize` avec `clientInfo {name: "x", version: "1"}` et en-têtes `user-agent`, `x-forwarded-for`, `mcp-protocol-version` **When** la route la traite **Then** une ligne `bench_events` porte method, client_name, client_version, protocol_version, user_agent, ip, scenario_slug, server_version
- [ ] **Given** un body batch de 2 requêtes **When** traité **Then** 2 lignes journalisées
- [ ] **Given** `tools/list` avec N tools **When** traité **Then** l'événement porte `tools_served = N` et `response_chars = JSON.stringify(tools).length`
- [ ] **Given** un repository dont `insertEvents` rejette **When** une requête est traitée **Then** la réponse MCP est identique au cas nominal et `console.error` est appelé une fois
- [ ] **Given** une description modifiée dans le repository entre deux requêtes **When** `tools/list` est rappelé **Then** la nouvelle description est servie (aucun cache)
- [ ] **Given** `pnpm build && pnpm start` **When** `pnpm mcp:smoke` **Then** initialize et tools/list OK contre le scénario `baseline` seedé par la migration, et l'appel de `bench_echo` renvoie ses arguments

## Implémentation

### Fichiers à créer
- `supabase/migrations/<timestamp>_bench.sql` : les 3 tables (architecture §4), `enable row level security`, index, trigger `updated_at` non requis ; seed du scénario `baseline` (`is_active = true`, instructions courtes en anglais) avec un tool `bench_echo` (`handler = echo`, schéma `{message: string}` avec `.description`, annotations `readOnlyHint: true`)
- `src/mcp/bench/repository.ts` : interface `BenchRepository { getActiveScenario(); listTools(scenarioId); insertEvents(events[]) }` ; `SupabaseBenchRepository` (client de `admin.ts`) ; `MemoryBenchRepository` (tableaux, utilisé par les tests)
- `src/mcp/bench/snapshot.ts` : `loadSnapshot(repo): Promise<BenchSnapshot>` (scénario ou snapshot vide, tools activés triés)
- `src/mcp/bench/registry.ts` : `toToolList(snapshot): Tool[]` (JSON Schema brut, `_meta` absent) ; `dispatchToolCall(snapshot, name, args, ctx)` par `handler` ; registre `handlers: Record<Handler, ToolHandler>` avec `echo` seul pour l'instant
- `src/mcp/bench/handlers/echo.ts`
- `src/mcp/bench/events.ts` : `parseRpcBody(body, headers, snapshot): BenchEvent[]` (objet ou batch ; `args` tronqué à 8 ko) ; `logEvents(repo, events)` qui ne rejette jamais
- `src/types/database.ts` régénéré (`pnpm db:types`)
- `tests/unit/bench-registry.test.ts`, `tests/unit/bench-events.test.ts`, `tests/unit/mcp-server.test.ts` (réécrit sur `MemoryBenchRepository`)

### Fichiers à modifier
- `src/mcp/server.ts` : `buildServerOptions(snapshot)` (serverInfo, instructions, `capabilities: { tools: { listChanged: true } }`) et `installBenchHandlers(server, snapshot, ctx)` posant `ListToolsRequestSchema` et `CallToolRequestSchema` sur `server.server` ; retrait du tool démo
- `src/app/api/[transport]/route.ts` : clone du body, `loadSnapshot`, `createMcpHandler` par requête, réponse, `after()` pour le journal (fallback `await` documenté en commentaire) ; `export const maxDuration = 60`
- `scripts/smoke-mcp.mjs` : appelle `bench_echo` au lieu de `get_status`
- Suppression : `src/mcp/tools/get-status.ts`, `src/lib/schemas/status.ts`, `src/lib/services/status-service.ts`

### Patterns à suivre
- `.claude/conventions/mcp-patterns.md` §4 (résultats deux formes, erreurs actionnables), §7, §10
- `.claude/conventions/database-patterns.md`, `supabase-patterns.md` (RLS)
- `.claude/conventions/security-patterns.md` (plafonds de taille, secrets)
- Point d'attention architecture n°1 : si `createMcpHandler` ne peut pas être instancié par requête, basculer sur `WebStandardStreamableHTTPServerTransport` du SDK et le noter en post-implémentation

## Tests attendus

### Unit tests
- [ ] `bench-registry.test.ts` : liste filtrée et ordonnée ; passthrough des champs ; echo nominal ; echo plafond ; tool inconnu ; snapshot vide
- [ ] `bench-events.test.ts` : parse initialize (clientInfo, en-têtes) ; parse tools/call (tool_name, args tronqués) ; batch ; `logEvents` avale l'erreur et appelle `console.error`
- [ ] `mcp-server.test.ts` : via `InMemoryTransport` et `MemoryBenchRepository` : initialize reflète le scénario ; tools/list reflète une modification entre deux appels ; `tools_served` et `response_chars` calculés

### Integration tests
- [ ] Aucun (smoke HTTP)

### E2E tests
- [ ] N/A

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
