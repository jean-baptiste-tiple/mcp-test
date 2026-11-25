# ADR-005 — Montée Next 15 vers Next 16

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-11-25 |
| **Statut** | Accepté |
| **Décideur(s)** | JB (montée de stack alignée sur le template dev-framework) |
| **Invariant touché** | `docs/architecture.md § Invariants` : « Next.js 15 App Router » devient « Next.js 16 App Router » |

## Contexte

Le template dev-framework est passé en Next 16.4.6 / React 19.3 le 2026-11-06 ; le banc restait en
Next 15.5.12. Next 16 impose : `middleware.ts` devient `proxy.ts` (export `proxy`, runtime nodejs
seul), `eslint-config-next` 16 n'existe qu'en flat config native, `next-env.d.ts` importe des types
générés dans `.next/`, et `next dev` écrit un `AGENTS.md` sauf `agentRules: false`.

## Décision

1. `next` `^16.4.6`, `react` et `react-dom` `^19.3.1`, `eslint-config-next` `^16.4.6`. ESLint reste
   en 9, TypeScript reste épinglé `~5.8.3` ; zod 3, Vitest 3, SDK MCP 1.26.0 et `mcp-handler` 1.1
   inchangés (peer `next` de `mcp-handler` : `>=13`).
2. `src/proxy.ts`, export `proxy`, même logique et même matcher que l'ancien middleware (`/login`,
   `/oauth/*`, `/auth-test/*`). L'export nommé est asserté par `tests/unit/proxy.test.ts` (ex-
   `middleware.test.ts`) : un nom faux ne casse ni le type-check ni le build, il retire le
   rafraîchissement de session des pages d'auth.
3. `next-env.d.ts` n'est plus versionné (`pnpm type-check` lançait déjà `next typegen`).
4. `eslint-plugin-react-hooks` 7, tiré par `eslint-config-next` 16 : règles React Compiler actives
   sans override, la v7 ne relevant rien ici (décision JB 2026-11-25 : pas de surface sans effet).
5. `agentRules: false` dans `next.config.ts`.

## Conséquences

- `/api/*` et `/.well-known/*` restent hors du proxy : chaque route porte sa propre auth.
- La montée vers zod 4 et le SDK MCP 2 reste un lot à part.

## Alternatives considérées

- **Rester en Next 15** : écart croissant avec le template, dont la méthode et les starters
  supposent Next 16.
- **Garder `middleware.ts`** (encore accepté, déprécié en 16) : le retrait viendrait à la
  prochaine majeure, sans le test qui verrouille le nom.
