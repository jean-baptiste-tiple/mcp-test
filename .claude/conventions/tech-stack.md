# Stack Technique

> Dernière MAJ : 2026-09-22 (E01-S01)

| Techno | Version | Rôle | Justification |
|--------|---------|------|---------------|
| Node.js | 24.14.0 | Runtime | |
| pnpm | 12.4.1 (`packageManager`) | Package manager | Rapide, strict, disk-efficient. ≥ 10 : scripts postinstall des dépendances bloqués par défaut (`onlyBuiltDependencies`) |
| Next.js | 15.5.12 (App Router) | Framework fullstack | SSR/SSG, Server Components, Server Actions, routing fichiers |
| TypeScript | ~5.8.3 (strict mode) | Typage | Sécurité du code, autocomplétion, refactoring. **Épinglé 5.8.x** — les versions 5.9+ causent des hangs de `tsc --noEmit`. |
| Supabase | Cloud, projet `nwdmkehnxvqyxddgogtu` | Backend-as-a-Service | DB PostgreSQL, RLS. Auth/OAuth réservés à E03 |
| @supabase/supabase-js | 2.116.0 | Client Supabase serveur | `src/lib/supabase/admin.ts` (clé secrète, `server-only`) — ADR-002 |
| supabase (CLI, devDependency) | 2.117.0 | Migrations, types | `pnpm db:push`, `pnpm db:types` ; binaire via `optionalDependencies` (pas de postinstall) ; `supabase login` + `supabase link` une fois |
| server-only | 0.0.1 | Garde d'import | Fait échouer le build si `admin.ts` est importé côté client |
| Tailwind CSS | 4.x | Styling | Utility-first, design system via config, purge auto |
| Shadcn/ui | latest | Composants UI | Copy-paste, personnalisables, accessibles, basés sur Radix |
| Zod | 3.x | Validation | Schemas partagés front/back, inférence TypeScript |
| React Hook Form | 7.x | Formulaires | Performance, intégration Zod via resolver |
| Vitest | 3.2.4 | Tests unit/integ | Rapide, compatible ESM, API Jest-like |
| Testing Library | latest | Tests composants | Test du comportement user, pas de l'implémentation |
| Playwright | latest | Tests E2E | Cross-browser, fiable, auto-wait |

## Canal MCP

> Squelette : `.claude/starters/mcp/` — installé en E01-S01 **sans widgets ni auth** (ADR-002).

| Techno | Version | Rôle | Justification |
|--------|---------|------|---------------|
| @modelcontextprotocol/sdk | **1.26.0** (épinglé exact) | Serveur MCP (tools) | Peer exact de `mcp-handler` 1.1.0. Le SDK v2 est scindé en `@modelcontextprotocol/server` / `client` : passer à `mcp-handler` 2.x impose de réécrire tous les imports — décision séparée, hors E01 |
| mcp-handler | **1.1.0** (épinglé `^1.1.0`) | Endpoint MCP dans Next.js (`/api/mcp`) | Transport Streamable HTTP sur route handler (`src/app/api/[transport]`), stateless (ADR-001). `pnpm add mcp-handler` sans contrainte installe 2.2.0 (peer `@modelcontextprotocol/server@^2`) |
| MCP Apps (GA 2026-01-26) — resources `ui://` | non installé | Widgets visuels dans Claude/ChatGPT | Hors scope du banc (ADR-002). Référence template : bundles `ui://` en `text/html;profile=mcp-app` + variante `-skybridge`, triple méta |
| @modelcontextprotocol/ext-apps | non installé (réf. template : 1.7.4) | SDK côté widget | Hors scope du banc |
| Vite + vite-plugin-singlefile | non installé | Build des widgets | Hors scope du banc |
| jose | non installé (réf. template : 6.x) | Validation JWT (JWKS Supabase) | Reviendra avec E03 (OAuth) |
| @anthropic-ai/sdk | non installé | IA serveur | Zéro IA serveur (règle Tiple) |
