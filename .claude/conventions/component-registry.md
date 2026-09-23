# Component Registry

> Derniere MAJ : 2026-09-22 (E01-S04)
> VERIFIER ce fichier AVANT de creer un composant/hook/util.

## UI Components (Shadcn/ui — installes)

| Composant | Path | Notes |
|-----------|------|-------|
| Accordion | `src/components/ui/accordion.tsx` | Radix, animation chevron |
| Alert | `src/components/ui/alert.tsx` | default, destructive |
| AlertDialog | `src/components/ui/alert-dialog.tsx` | Confirmation modale |
| Avatar | `src/components/ui/avatar.tsx` | Image + fallback initiales |
| Badge | `src/components/ui/badge.tsx` | 6 variants (default, secondary, destructive, outline, success, warning) |
| Breadcrumb | `src/components/ui/breadcrumb.tsx` | Fil d'ariane avec separateurs |
| Button | `src/components/ui/button.tsx` | 6 variants, 4 sizes, asChild |
| Calendar | `src/components/ui/calendar.tsx` | react-day-picker v9 |
| Card | `src/components/ui/card.tsx` | Header, Title, Description, Content, Footer |
| Checkbox | `src/components/ui/checkbox.tsx` | Radix Checkbox |
| Command | `src/components/ui/command.tsx` | Palette de commandes (cmdk) |
| Dialog | `src/components/ui/dialog.tsx` | Modal Radix |
| DropdownMenu | `src/components/ui/dropdown-menu.tsx` | Menu contextuel complet |
| Form | `src/components/ui/form.tsx` | Integration react-hook-form |
| Input | `src/components/ui/input.tsx` | Pill, fond bg-card, focus ring mint |
| Label | `src/components/ui/label.tsx` | Radix Label |
| Popover | `src/components/ui/popover.tsx` | Contenu flottant |
| Progress | `src/components/ui/progress.tsx` | Barre de progression |
| RadioGroup | `src/components/ui/radio-group.tsx` | Radix RadioGroup |
| ScrollArea | `src/components/ui/scroll-area.tsx` | Zone scrollable custom |
| Select | `src/components/ui/select.tsx` | Radix Select |
| Separator | `src/components/ui/separator.tsx` | Horizontal/vertical |
| Sheet | `src/components/ui/sheet.tsx` | Panneau lateral (4 directions) |
| Skeleton | `src/components/ui/skeleton.tsx` | Placeholder anime |
| Slider | `src/components/ui/slider.tsx` | Range input |
| Sonner | `src/components/ui/sonner.tsx` | Toast notifications |
| Spinner | `src/components/ui/spinner.tsx` | SVG anime, 3 tailles |
| Switch | `src/components/ui/switch.tsx` | Toggle on/off |
| Table | `src/components/ui/table.tsx` | Wrappers HTML table |
| Tabs | `src/components/ui/tabs.tsx` | Navigation par onglets |
| Textarea | `src/components/ui/textarea.tsx` | Champ multi-lignes |
| Toggle | `src/components/ui/toggle.tsx` | Bouton toggle |
| ToggleGroup | `src/components/ui/toggle-group.tsx` | Groupe de toggles |
| Tooltip | `src/components/ui/tooltip.tsx` | Info-bulle |

## Composants metier partages

| Composant | Path | Props cles | Notes |
|-----------|------|------------|-------|
| ThemeProvider | `src/components/theme-provider.tsx` | children, attribute, defaultTheme | Provider next-themes (client) |
| ThemeToggle | `src/components/theme-toggle.tsx` | — | Bouton toggle light/dark (client) |
| PageContainer | `src/components/page-container.tsx` | heading?, description?, children | Wrapper page max-w-7xl |
| EmptyState | `src/components/empty-state.tsx` | icon?, heading, description?, action? | Etat vide (listes, tables) |
| StatCard | `src/components/stat-card.tsx` | label, value, description?, icon?, trend? | KPI card pour dashboards (hover-lift, valeur mono) |
| DataTable | `src/components/data-table.tsx` | columns, data, emptyMessage? | Table generique typee |
| CopyButton | `src/components/copy-button.tsx` | value, label?, size?, variant? | Copie presse-papiers + feedback 2s (client) |
| AppLogo | `src/components/logo.tsx` | size?, label?, className? | Logo Tiple (SVG mint) — `label` = nom du produit |
| SidebarNav | `src/components/sidebar-nav.tsx` | — (items : `src/components/nav-items.ts`) | Nav sidebar sombre, item actif pill mint (client, usePathname) |

## Hooks

| Hook | Path | Retourne | Notes |
|------|------|----------|-------|
<!-- Ajouter ici chaque hook custom cree -->

## Server Actions

| Action | Path | Input -> Output | Notes |
|--------|------|-----------------|-------|
<!-- Ajouter ici chaque Server Action creee -->

## Shared Schemas (Zod)

| Schema | Path | Champs cles | Utilise par |
|--------|------|-------------|-------------|
| BenchMutateInput | src/lib/schemas/bench-mutate.ts | action (enum), name, title, description, input_schema, instructions | tool `bench_mutate` (seule mutation du banc) |
| inputSchemas(prefix) | src/proto/schemas.ts | entrées des six outils proto (zod/v4) ; `toInputSchema`, `parseInput` | adaptateur MCP proto (validation + inputSchema servi) |

## Utils

| Util | Path | Usage |
|------|------|-------|
| cn | src/lib/utils/cn.ts | Merge Tailwind classes (clsx + tailwind-merge) |
| getAdminClient | src/lib/supabase/admin.ts | Client Supabase clé secrète, `server-only`, mémoïsé, typé `Database` — SEUL accès aux tables du banc (ADR-002). Jamais depuis un Client Component |
| byteLength, truncateToBytes | src/lib/utils/byte-size.ts | Taille UTF-8 d'un texte, troncature à N octets (plafonds d'arguments et de journal) |
| getProtoClient | src/lib/supabase/admin.ts | Client clé secrète typé `ProtoDatabase`, schéma `proto` — serveur proto seulement (ADR-003) |
| must, many, one | src/proto/db.ts | Lecture d'une réponse supabase-js (optionnelle, liste, ligne attendue) ; panne → `Proto store unavailable` |
| resolveIdentity, canRead | src/proto/identity.ts | Utilisateur du segment d'URL → org, équipes (membre ou non, responsable) ; règle de lecture des nœuds |
| requireCtx, issueCtx | src/proto/services/ctx.ts | Émission et garde du code ctx (absent, inconnu, autre utilisateur, règles changées) |
| renderContext, buildContext | src/proto/services/context.ts | Blocs de context par priorité, budget coupé par la fin |
| flushJournal, initializeEntries, loggedArgs | src/proto/services/journal.ts | Journal proto : écriture qui n'échoue jamais, client de l'initialize, arguments tronqués à 2 ko |
| buildTools, toolKey, serverInstructions | src/proto/mcp/tools.ts | Six outils par organisation (préfixe, descriptions, inputSchema) |
| installProto, buildServerOptions | src/proto/mcp/server.ts | Adaptateur MCP proto (handlers bas niveau, garde ctx, journal) |
| readEnv | scripts/lib/env.mjs | `.env.local` hors Next (scripts et tests proto) ; bench-seed.mjs garde sa propre copie |
| seedProto, deleteProtoOrgs, protoOrgSlugs | scripts/lib/proto-seed.mjs | Données Acme et Delta en base ; orgs jetables suffixées pour les tests |

## Types partages

| Type | Path | Usage |
|------|------|-------|
| BenchScenarioRow, BenchToolRow, BenchEventInsert | src/mcp/bench/repository.ts | Alias des types générés `Database` — ne pas redéfinir |
| BenchRepository, SupabaseBenchRepository | src/mcp/bench/repository.ts | Accès aux tables du banc ; client injecté ; mutations (updates posent `updated_at`), `hasRecentReadmeCall` |
| ProtoDatabase, Proto*Row | src/types/proto-database.ts | Types du schéma `proto`, écrits à la main au format gen types (à régénérer quand le jeton revient) |
| Identity, Team | src/proto/identity.ts | Qui appelle le serveur proto |
| ServiceResult, ProtoError | src/proto/result.ts | Contrat service → adaptateur (texte ou refus actionnable) |
| BenchSnapshot, loadSnapshot | src/mcp/bench/snapshot.ts | Scénario actif + tools activés, relu à chaque requête ; snapshot vide fabriqué à neuf (jamais partagé) |
| parseRpcBody, logEvents | src/mcp/bench/events.ts | Journal JSON-RPC → `bench_events` (`BenchEventInsert`), plafonné à 100 événements par requête, jamais bloquant |
| Handler, ToolHandler, dispatchToolCall | src/mcp/bench/registry.ts | Dispatch par `handler`, gardes ack / gate, erreurs actionnables ; les handlers sont dans `handlers/` |
| applyLever | src/mcp/bench/levers.ts | Fonction pure : lignes → tools JSON Schema brut + six leviers readme (textes d'architecture §6) |
| makeAck, verifyAck, getAckSecret | src/mcp/bench/ack.ts | Ack HMAC-SHA256 base32 12 car., fenêtre TTL, `timingSafeEqual`, secret requis en prod |
| BenchRequestContext, outcomeFor | src/mcp/bench/context.ts | Contexte par requête (server, repo, headers, fingerprint, requestId brut, outcomes) |
| whoamiHandler, mutateHandler, readmeHandler, echoHandler | src/mcp/bench/handlers/*.ts | Les 4 sondes ; `mutate` = seule mutation réelle |
| MemoryBenchRepository | src/mcp/bench/repository.memory.ts | Implémentation mémoire pour les tests (extraite de `repository.ts`) |
| isRecord | src/lib/utils/is-record.ts | Garde de type objet simple (events, levers) |
| makeScenario, makeTool | tests/factories/bench.factory.ts | Fixtures scénario / tool de test |
| PROBES, BASELINE | scripts/lib/probes.mjs | Source unique des 4 sondes et du scénario `baseline` (les migrations ne sont qu'un amorçage) |
| buildCatalogue, canary, fillText | scripts/lib/catalogue.mjs (+ .d.mts) | Catalogue déterministe des scénarios du banc, canaris `[C:slug:field:pos:hex]` |
| bench-seed | scripts/bench-seed.mjs | `pnpm bench:seed` : upsert idempotent des scénarios et tools, restaure `baseline`, jamais `is_active` |
