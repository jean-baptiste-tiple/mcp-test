# Story E01-S02 — Registre de tools en base et journal des requêtes

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer |
| **Statut** | ✅ Done (2026-09-22) |
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

- [x] **Given** la migration appliquée **When** on inspecte le schéma **Then** les tables `bench_scenarios`, `bench_tools`, `bench_events` existent avec les colonnes, checks, FK cascade, index unique partiel sur `is_active`, index listés en architecture §4, RLS activé et aucune policy
- [x] **Given** un scénario actif avec 3 tools activés et 1 désactivé (repository mémoire) **When** un client `InMemoryTransport` appelle `tools/list` **Then** exactement les 3 tools activés, dans l'ordre `sort_order`, avec name, title, description, inputSchema et annotations des lignes
- [x] **Given** aucun scénario actif **When** `initialize` puis `tools/list` **Then** serverInfo `mcp-bench` version `0.0.0`, instructions « No active scenario », liste vide, aucune erreur
- [x] **Given** un tool `handler = echo` **When** il est appelé avec `{message: "x", extra: 1}` **Then** `content[0].text` est la sérialisation JSON exacte des arguments et `structuredContent.args` les contient ; avec plus de 64 ko d'arguments **Then** `isError` avec message actionnable
- [x] **Given** un tool inconnu **When** `tools/call` **Then** `isError` avec « Unknown tool <name>. Call tools/list to refresh. » (pas d'exception)
- [x] **Given** une requête HTTP `initialize` avec `clientInfo {name: "x", version: "1"}` et en-têtes `user-agent`, `x-forwarded-for`, `mcp-protocol-version` **When** la route la traite **Then** une ligne `bench_events` porte method, client_name, client_version, protocol_version, user_agent, ip, scenario_slug, server_version
- [x] **Given** un body batch de 2 requêtes **When** traité **Then** 2 lignes journalisées
- [x] **Given** `tools/list` avec N tools **When** traité **Then** l'événement porte `tools_served = N` et `response_chars = JSON.stringify(tools).length`
- [x] **Given** un repository dont `insertEvents` rejette **When** une requête est traitée **Then** la réponse MCP est identique au cas nominal et `console.error` est appelé une fois
- [x] **Given** une description modifiée dans le repository entre deux requêtes **When** `tools/list` est rappelé **Then** la nouvelle description est servie (aucun cache)
- [x] **Given** `pnpm build && pnpm start` **When** `pnpm mcp:smoke` **Then** initialize et tools/list OK contre le scénario `baseline` seedé par la migration, et l'appel de `bench_echo` renvoie ses arguments

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

Implémentée le 2026-09-22 par un agent Opus (pilote Fable), review isolée.

### Écarts avec l'architecture
- `installBenchHandlers(server, snapshot)` et `dispatchToolCall(snapshot, name, args)` livrés sans `ctx` : aucun handler S02 ne le lisait (surface morte). S03 l'introduit avec `server`, `headers`, `fingerprint`.
- Client Supabase **injecté** (`new SupabaseBenchRepository(getAdminClient())` depuis la route) au lieu d'être importé par `repository.ts` : `admin.ts` charge `server-only`, qui jette à l'import hors contexte serveur, ce qui empêcherait les tests d'importer `MemoryBenchRepository`.
- Migration = schéma complet d'architecture §4, y compris les colonnes lues seulement par S03/S04 (`readme_*`, `ack_ttl_seconds`, `bench_tools.version`, `list_changed_sent`, `is_error`, `error_text`). Arbitrage pilote : un modèle défini d'un bloc, S03/S04 Ready dans le même sprint, l'en-tête de la migration nomme ces colonnes.
- `src/mcp/config.ts` : `MCP_SERVER_INFO` devient `FALLBACK_SERVER_INFO` (serverInfo du snapshot vide, version `0.0.0`) + `FALLBACK_INSTRUCTIONS` + plafonds (64 ko args, 8 ko journal).
- Filtre `enabled` et tri `sort_order` dans `loadSnapshot` (code partagé testé), `listTools` reste un accesseur brut.
- Panne DB = requête MCP en erreur (500) : pas de repli sur un snapshot vide, qui produirait des mesures fausses.
- GET et DELETE ne sont pas journalisés (pas de body) : reporté en S03 (signal « le host tente d'ouvrir le flux SSE »).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| BenchRepository, SupabaseBenchRepository, MemoryBenchRepository | `src/mcp/bench/repository.ts` | Interface + impl Supabase (client injecté) + impl mémoire pour les tests |
| loadSnapshot | `src/mcp/bench/snapshot.ts` | Scénario actif + tools activés triés ; snapshot vide sinon ; aucun cache |
| toToolList, dispatchToolCall, handlers | `src/mcp/bench/registry.ts` | Lignes → tools JSON Schema brut ; dispatch par `handler` (echo en S02) |
| parseRpcBody, logEvents | `src/mcp/bench/events.ts` | JSON-RPC (objet ou batch, plafonné à 100 événements par requête) → `BenchEventInsert` ; `\u0000` remplacé (jsonb) ; journal qui n'échoue jamais |
| echo | `src/mcp/bench/handlers/echo.ts` | Renvoie les arguments ; plafond 64 ko |
| byteLength, truncateToBytes | `src/lib/utils/byte-size.ts` | Taille UTF-8 d'un texte et troncature à N octets (plafond 64 ko, journal 8 ko). Ajoutés au registry |
| bench.factory | `tests/factories/bench.factory.ts` | Fixtures scénario / tool / événement pour les tests |

### Option plus simple écartée
Journaliser dans le callback d'init de mcp-handler (un événement par construction du serveur, sans clone du body ni `parseRpcBody`). Rejeté : le callback ne voit ni le body, ni le batch, ni le `rpc_id` ; `tools_served`, `response_chars` et `args` seraient impossibles, et un batch de 2 ne produirait qu'une ligne (AC explicite). Sous-option écartée : `await` du journal avant la réponse ; le banc mesure la latence du serveur, pas celle de son journal, et `after()` fonctionne (repli documenté en commentaire dans la route).

### Notes
- `createMcpHandler` par requête est sain : mcp-handler 1.1.0 instancie déjà un `McpServer` par requête HTTP et garde son timer de nettoyage au niveau module. mcp-handler consomme le body (`req.json()`) : clone avant l'appel.
- `after()` de `next/server` fonctionne sous `next start` : smoke = 3 lignes `bench_events` relues en base (initialize avec clientInfo `smoke@1.0`, protocole `2025-06-18` ; tools/list `tools_served = 1`, `response_chars = 358` ; tools/call `bench_echo`).
- `src/mcp/tool-result.ts` conservé (`toToolResult`, `toolError` utilisés par echo et registry).
- Migration `20260922082138_bench.sql` appliquée sur le projet cloud ; schéma relu : RLS activé, 0 policy, index et contraintes conformes.
- Review isolée : 2 MOYENNE corrigées (batch JSON-RPC sans plafond dans le journal → `MAX_EVENTS_PER_REQUEST = 100` ; `EMPTY_SNAPSHOT` singleton mutable exporté → fabrique `emptySnapshot()` non exportée) ; BASSE corrigées : alias `BenchEvent` retiré, message PostgREST non remonté dans l'exception, `title` vérifié par le smoke, README §Structure. Seconde review : neutralisation `\u0000` et surrogates isolés étendue à toutes les colonnes texte issues du body (`asText`) et à `args` (Postgres refuse `\u0000` en `text` et en `jsonb` : une seule valeur perdrait tout le batch du journal), `Object.hasOwn` dans le garde des handlers, `console.warn` quand un batch est tronqué, tests `byte-size`, smoke documenté comme supposant `baseline` actif. Reportées en S03 : court-circuit GET/DELETE (journalisés comme `http:GET`), `updated_at` posé par les updates. À trancher au wrap-up : `it()` en français (pratique établie) vs testing-strategy (anglais).
