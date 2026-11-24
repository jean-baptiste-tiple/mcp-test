# MCP Template — Tiple Method

Template Git pour bootstrapper un **produit MCP-first** avec la Tiple Method : un SaaS dont le canal principal est un **serveur MCP** consommé depuis Claude et ChatGPT (tools + widgets MCP Apps), avec une app web Next.js en canal secondaire.

C'est le template de base (structure, templates de docs, checklists, conventions, skills Claude Code, design system) **spécialisé MCP** :

- **Conventions MCP** (`.method/conventions/mcp-patterns.md`, tag `mcp`) : parité web/MCP par services partagés, AX (découverte par l'agent), design des tools, widgets MCP Apps **dual-host Claude + ChatGPT**, auth OAuth 2.1 via Supabase, serveur stateless, golden queries
- **Section "Canal MCP"** dans le template d'architecture (`.method/templates/architecture.tmpl.md`) : tables tools / widgets / auth à remplir au cadrage
- **Template de golden queries** (`.method/templates/mcp-golden-queries.tmpl.md`) : l'éval anti-régression du routage des tools, à rejouer sur les deux hosts
- **Règles MCP** dans le tag `mcp`, routé par les globs de `.method/conventions/_index.md` dès qu'on touche `src/mcp/`, `src/proto/` ou `src/auth-test/`

Stack : Next.js 15 (App Router) + TypeScript strict + Tailwind CSS + Shadcn/ui. Backend Supabase via starter (DB + RLS + Auth + Storage — c'est aussi l'authorization server OAuth 2.1 du canal MCP). Canal MCP : `@modelcontextprotocol/sdk` + `mcp-handler` (endpoint `/api/mcp`), widgets buildés par Vite en HTML single-file. IA optionnelle : Claude API (`@anthropic-ai/sdk`).

## MCP Bench

Ce dépôt n'est pas un produit : c'est un **banc de mesure** du comportement des hosts MCP
(Claude, ChatGPT, MCP Inspector) — quand relisent-ils `tools/list`, honorent-ils
`notifications/tools/list_changed`, que font-ils d'une description de 8 ko, d'un catalogue de
500 tools, d'un levier « lis le readme d'abord ». Les tools du banc sont des **lignes en base**,
pas du code : les modifier ne demande aucun déploiement.

**⚠️ Le code du banc n'est pas un exemple de produit MCP.** Il déroge volontairement aux règles
MCP du `CLAUDE.md` : endpoint `/api/mcp` **public** (pas d'OAuth en phase 1), clé secrète
Supabase côté serveur, pas de widgets, pas de chaîne `Zod → service → tool` pour les tools
générés, pas de plafond de 10 tools. Chaque dérogation et sa contrepartie :
`docs/decisions/ADR-002-derogations-banc.md`. Transport stateless figé par
`docs/decisions/ADR-001-transport-stateless.md`.

Aucun middleware : toute route `/api/*` est publique par construction ; chaque handler ajouté
porte sa propre auth.

### Lancer le smoke test MCP

`scripts/smoke-mcp.mjs` appelle `initialize`, `tools/list` et `tools/call bench_echo` contre un
serveur **déjà démarré**, et gère les réponses SSE comme JSON. Il suppose le scénario
`baseline` actif en base (`serverInfo.name` = `mcp-bench`, `title` = `MCP Bench`, tool
`bench_echo`) et échoue si aucun scénario ne l'est (`serverInfo.version` à `0.0.0`) : c'est
toute la chaîne base → snapshot → tools qui est testée, pas seulement la route.

```bash
pnpm build && pnpm start          # ou pnpm dev
pnpm mcp:smoke                    # défaut : http://localhost:3000/api/mcp
pnpm mcp:smoke https://mcp-test-navy.vercel.app/api/mcp   # après déploiement
```

Exploration manuelle : `pnpm mcp:inspect` puis connecter `http://localhost:3000/api/mcp`.

### Brancher la CLI Supabase (une fois par machine)

`pnpm db:push` et `pnpm db:types` parlent au projet cloud `nwdmkehnxvqyxddgogtu` via les
identifiants stockés par la CLI — ils ne lisent pas `.env.local`. Deux commandes à jouer une
seule fois, avec le `SUPABASE_ACCESS_TOKEN` de `.env.local` et le mot de passe Postgres
(dashboard Supabase → Settings → Database) :

```bash
pnpm exec supabase login --token <SUPABASE_ACCESS_TOKEN>
pnpm exec supabase link --project-ref nwdmkehnxvqyxddgogtu --password <mot de passe Postgres>
```

Ensuite : `pnpm db:migrate <nom>` (nouvelle migration SQL), `pnpm db:push` (applique au projet
cloud), `pnpm db:types` (régénère `src/types/database.ts`). Le lien est stocké dans
`supabase/.temp/` (gitignoré).

### Scénarios du banc

Un scénario = une ligne `bench_scenarios` + ses lignes `bench_tools`. Le catalogue vit dans
`scripts/lib/catalogue.mjs` (générateur déterministe : longueurs de descriptions, nombres de
tools, longueurs d'instructions, formes de schéma, leviers readme, canaris `[C:…]`) et
`pnpm bench:seed` le pousse en base :

```bash
pnpm bench:seed
```

Pré-requis : migrations appliquées (`pnpm db:push`). Les quatre sondes (`bench_whoami`,
`bench_echo`, `bench_mutate`, `bench_readme`) sont déclarées dans `scripts/lib/probes.mjs` —
source unique, copiée à l'identique dans chaque scénario. Toute évolution d'une sonde se fait
là, puis `pnpm bench:seed` ; les migrations ne servent plus que d'amorçage historique.

`pnpm bench:seed` **restaure aussi `baseline`** (sondes, instructions, readme, version) et
supprime les tools qu'une campagne y a ajoutés — c'est la remise d'aplomb décrite dans
`docs/bench/protocol.md` §3. Ce que le seed ne fait jamais : écrire `is_active`. Il est
idempotent, et c'est lisible dans son résumé — deuxième passe sur une base déjà seedée :

```
scénarios : 0 créés, 0 mis à jour, 27 inchangés (sur 27)
tools     : 0 insérés, 0 mis à jour, 0 supprimés
```

Il peut donc se relancer au milieu d'une campagne sans changer ce que le host voit.

**Activer un scénario** = un geste manuel, dans Supabase Studio (table `bench_scenarios`) :
passer `is_active` à `true` sur la ligne voulue. Un index unique partiel garantit **un seul
scénario actif** : désactiver l'ancien d'abord. La liste des scénarios et les prompts à jouer
sur chacun sont dans `docs/bench/protocol.md`. `baseline` fait partie du catalogue : c'est le
scénario témoin, actif par défaut.

### Serveur proto (E04)

Maquette de la plateforme MCP d'entreprise, à côté du banc : `/api/proto/u/<utilisateur>/mcp`,
six outils préfixés par le client (`acme_*` pour `jb`, `delta_*` pour `jb-delta`). **Aucune
authentification** : l'utilisateur est le segment d'URL (ADR-003), les données sont fictives
(schéma `proto`). Ce n'est pas un exemple de produit.

```bash
pnpm proto:seed   # remplace les orgs acme et delta (journal compris)
```

Détail : `docs/architecture.md` §9. Les tests `tests/integration/proto-*.test.ts` tournent contre
le Supabase du banc sur des organisations jetables, et se sautent sans les clés de `.env.local`.

### Serveur auth-test (E03)

Troisième serveur, sans lien de code avec le banc ni le proto : il met en œuvre au plus court
l'hypothèse « Connexion et identité » pour la prouver ou la réfuter (ADR-004). Supabase Auth est le
serveur d'autorisation OAuth 2.1 (enregistrement dynamique) ; notre serveur est le resource server,
servi par nom d'hôte :

- `https://mcp-test-acme.vercel.app/api/auth-test/mcp` : Acme Énergies, outils `acme_whoami`, `acme_echo`
- `https://mcp-test-e03-delta.vercel.app/api/auth-test/mcp` : Delta Logistique, `delta_whoami`, `delta_echo`

Ce qui est prouvé sans host (Vitest) :

- l'organisation vient de l'hôte appelé (`oauth_test.orgs.host`), jamais du jeton ; hôte inconnu : 404 ;
- sans jeton valide (absent, signé par une autre clé, expiré, autre émetteur) : 401, et
  `WWW-Authenticate` désigne les métadonnées de l'hôte appelé
  (`/.well-known/oauth-protected-resource/api/auth-test/mcp`, RFC 9728, aussi à la racine) ;
- l'appartenance est relue sous le jeton de l'utilisateur (RLS) à chaque `tools/call` : un non-membre
  voit les outils, chaque appel est refusé ; retirer un membre refuse l'appel suivant, même jeton ;
- chaque requête (401, 404, métadonnées, `initialize`, `tools/list`, `tools/call`) laisse une ligne
  `oauth_test.journal` : décision, motif, résumé de claims, jamais le jeton.

Les hosts (Claude Code, claude.ai, ChatGPT) ne servent qu'à ce qu'eux seuls montrent : enregistrement,
consentement, rafraîchissement, révocation (`docs/bench/results-oauth.md`).

```bash
pnpm oauth:seed                          # organisations, comptes de JB et de son alias, appartenances
pnpm oauth:member delta <email> remove   # retirer (add : ajouter) un membre pendant une campagne
```

Branche `e03-oauth` (worktree `C:\apps\mcp-test-e03`, préversion Vercel), fusionnée dans `main` avec
l'accord de JB. Code : `src/auth-test/`, routes `src/app/api/auth-test/[transport]/` et
`src/app/.well-known/oauth-protected-resource/`. Détail : `docs/architecture.md` §10,
`docs/decisions/ADR-004-auth-assistants-supabase-oauth.md`. Tests : `tests/unit/auth-test-*.test.ts`
(sans réseau) et `tests/integration/auth-test-*.test.ts` (Supabase du banc, organisations et comptes
jetables, sautés sans les clés).

## Le canal MCP en bref

Les invariants que le template impose (détail dans `.method/conventions/mcp-patterns.md`) :

1. **Parité par services partagés** — toute capacité métier = 1 fonction dans `lib/services/` + 2 adaptateurs fins (Server Action web, tool MCP). Jamais de logique métier dans un tool.
2. **Dual-host day one** — widgets déclarés avec la triple méta (`ui.resourceUri` standard MCP Apps GA + alias plat pré-GA + `openai/outputTemplate` → variante skybridge pour ChatGPT) via un helper unique ; chaque bundle servi en 2 resources (`text/html;profile=mcp-app` + `text/html+skybridge`) ; bridge unique `widgets/shared/bridge.ts` sur le SDK officiel `ext-apps` ; matrice de test des deux hosts avant push.
3. **Auth OAuth 2.1 avec Supabase en authorization server** — RFC 9728, 401 `WWW-Authenticate`, `securitySchemes` par tool, client Supabase au JWT de l'utilisateur → RLS active dans les tools. `service_role` interdit.
4. **Transport figé par ADR** — stateless par défaut (Streamable HTTP sans session, état métier en Postgres, compatible Vercel) ; stateful (sessions + SSE via Redis) si le produit exige push/subscriptions — bloc prêt dans le starter.
5. **AX mesurée** — `instructions` serveur maintenu, descriptions "Use this when… / Do not use for…", `next_actions` dans chaque résultat, golden queries rejouées à chaque évolution de tool.
6. **Dégradation** — tout tool fonctionne sans widget ; le widget est un bonus d'ergonomie.

## Design System

Le design system **Tiple (vert mint, éditorial)** complet est inclus, prêt à l'emploi — éprouvé dans mcp-cv-editor :

- **Thème :** Vert mint Tiple `#06f5a2` sur neutres chauds, fond de page `#FAFAFA` avec pattern éditorial (`.page-canvas` : halo mint + semis de croix sous le contenu), sidebar sombre les deux thèmes, dark mode soigné (class-based, next-themes), token `--primary-dark` pour le texte-accent (contraste AA)
- **34 composants Shadcn/ui** (style new-york) dans `src/components/ui/` — boutons/badges en pilule, labels mono
- **8 composants métier** : PageContainer, EmptyState, StatCard, DataTable, ThemeToggle, ThemeProvider, CopyButton, AppLogo (+ favicon)
- **Preview interactive** : route `/design-system` (sections modulaires)
- **Tokens complets** : couleurs (oklch), typographie (Instrument Sans + JetBrains Mono), spacing, radius, shadows, utilitaires éditoriaux (hover-lift, text-stroke, noise-overlay)
- **Icônes** : Phosphor pour l'app, lucide en interne Shadcn
- **Documentation** : `docs/design/system.md` — source unique des tokens : `src/app/globals.css` (Tailwind v4 CSS-first)

## Starters

Le template est minimal par défaut. Les starters dans `.method/starters/` ajoutent des fonctionnalités complètes. Ils sont identifiés par `/plan` (Phase 0) et installés lors de la story de setup.

| Starter | Dossier | Ce qu'il ajoute |
|---------|---------|-----------------|
| **Canal MCP** | `.method/starters/mcp/` | Endpoint `/api/mcp` (stateless par défaut, stateful prêt), tool démo (`schema Zod → service → tool`), widgets MCP Apps GA (triple méta + skybridge, bundles inlinés), bridge SDK `ext-apps`, auth OAuth 2.1 (RFC 9728), tests `InMemoryTransport` + smoke HTTP |
| **Supabase + Auth** | `.method/starters/supabase-auth/` | Base de données, auth (login/signup/reset), middleware, Server Actions, pages auth, CI migrations |

Pour un produit MCP-first, les deux starters vont ensemble : Supabase + Auth fournit la DB (RLS) et l'authorization server OAuth 2.1 du canal MCP ; le starter Canal MCP fournit le serveur, les widgets et le câblage auth (bloc à décommenter une fois Supabase en place).

## Quick Start

```bash
# 1. Créer un projet depuis le template ("Use this template" sur GitHub, ou clone)
git clone https://github.com/jean-baptiste-tiple/mcp-template mon-projet
cd mon-projet

# 2. Installer les dépendances
pnpm install

# 3. Lancer le dev server
pnpm dev

# 4. Lancer le cadrage dans Claude Code (brief → PRD → archi → epics/stories)
# /plan
```

Le cadrage (`/plan`) remplit la section "Canal MCP" de l'architecture (tools, widgets, auth), fige les décisions structurantes par ADR (authorization server, stateless) et crée `docs/mcp-golden-queries.md` depuis le template.

## Méthode

La méthode de développement est décrite dans `CLAUDE.md` (échelles, skills, sous-agents, gate de
commit) ; elle vient du template et se met à jour par `sync-method` (`CLAUDE.md § Mettre à jour
un projet dérivé`).

| Skill | Rôle |
|-------|------|
| `/dev` | Toute action code : conventions routées par globs, implémentation, tests, vérification |
| `/design` | Brief de design avant le code, critique sur captures après |
| `/plan` | Cadrage (explicite uniquement) |
| `/revue` | Code review adossée aux conventions |
| `/audit` | Audit de la codebase existante |
| `/verify` | `pnpm verify` : `check:framework`, type-check, lint, tests, puis reçu |
| `/wrap-up` | Capture des apprentissages de fin de chantier |
| `/commit-push` | Seul chemin de commit (le hook bloque `git commit` direct) |
| `/conventions` | Question sur une règle, sans fichier touché |

## Structure

```
├── CLAUDE.md                    # Méthode + règles du projet (banc MCP, Supabase partagé)
├── .claude/
│   ├── skills/                  # 9 skills de la méthode (dev, design, plan, revue, verify, ...)
│   ├── agents/                  # Sous-agents nommés (implementer, designer, design-critic, reviewer, auditor)
│   └── hooks/                   # enforce-bash-rules, enforce-git-gate, coordinate-sessions (.mjs)
├── .method/
│   ├── templates/               # Templates de documents (dont architecture avec section MCP, golden queries)
│   ├── checklists/              # Quality gates (review, design, story, PRD)
│   ├── conventions/             # Conventions par tag, routées par les globs de _index.md
│   ├── starters/                # Starters déjà installés (mcp, supabase-auth), gardés pour référence
│   └── sprint/status.md         # Sprint tracking
├── docs/
│   ├── brief.md / prd.md / architecture.md   # Générés par /plan
│   ├── changelog.md             # Journal des évolutions
│   ├── design/                  # Design system, maquettes, flows
│   ├── epics/ + stories/        # Backlog implémentable
│   └── decisions/               # ADRs du projet
├── src/
│   ├── app/
│   │   ├── (dashboard)/         # Layout principal + page /dashboard placeholder
│   │   ├── design-system/       # Preview du design system
│   │   └── api/[transport]/     # Endpoint MCP servi sur /api/mcp — mcp-handler (PAS api/mcp/ : 404 sinon)
│   ├── mcp/                     # config, assemblage, bench/ (registre, snapshot, journal, handlers)
│   ├── proto/                   # Serveur proto (E04)
│   ├── auth-test/               # Serveur auth-test OAuth 2.1 (E03)
│   ├── components/              # ui/ (34 Shadcn) + composants métier
│   └── lib/                     # schemas/, supabase/, utils/
└── tests/                       # Unit, integration, e2e (smoke fournis)
```

Pas de dossier `widgets/` : les widgets MCP Apps du starter ne sont pas installés dans ce projet (ADR-002). Le squelette complet reste dans `.method/starters/mcp/`, guidé par `.method/conventions/mcp-patterns.md`.

## Conventions par tags

Les conventions techniques sont dans `.method/conventions/`. `coding-standards.md` est toujours
lue ; les autres sont routées par la colonne **Globs** de `.method/conventions/_index.md` (fichier
touché → tag → convention), plus les tags déclarés par une story.

## Qualité & Déploiement

| Check | Où | Quand |
|---|---|---|
| `pnpm verify` (`check:framework` + `type-check` + `lint` + `test`, puis reçu) | **Local** (`/verify`, réutilisé par `/commit-push`) | Avant chaque commit |
| `pnpm test:e2e` | **Local** (smoke Playwright fourni : redirect home + design system) | À la demande / avant release |
| `pnpm build` | **CI GitHub** (`.github/workflows/ci.yml`) | Après chaque push — validation Vercel + catch des erreurs Linux |

Pour les stories taguées `mcp` : en plus des checks ci-dessus, passer la **matrice de test dual-host** (§5.4 de `mcp-patterns.md`) et rejouer les **golden queries** sur Claude et ChatGPT (developer mode) si un tool ou une description a changé.

Les hooks Claude Code (`.claude/hooks/`) bloquent les commandes interdites, tout `git commit` / `git push` sans reçu de `pnpm verify` à jour, et coordonnent les sessions parallèles sur le même checkout.

Le déploiement Vercel est automatique (connecter le repo). La CI migrations Supabase est ajoutée par le starter Supabase + Auth si activé.
