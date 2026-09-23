# Sprint Status

<!-- Géré par /tm-plan (init) puis /tm-dev -->

## Sprint actuel

### Informations
- **Début :** 2026-09-23
- **Fin prévue :** —
- **Epic focus :** E04 — Maquette de la plateforme MCP d'entreprise (E01 clos le 2026-09-22)

### Stories

| ID | Titre | Statut | Assigné |
|----|-------|--------|---------|
| E01-S01 | Setup technique : starter MCP sans widgets, Supabase, migrations | ✅ Done (2026-09-22) | Opus (agent) |
| E01-S02 | Registre de tools en base et journal des requêtes | ✅ Done (2026-09-22) | Opus (agent) |
| E01-S03 | Sondes whoami, mutate, readme et leviers readme | ✅ Done (2026-09-22) | Opus (agent) |
| E01-S04 | Catalogue de scénarios, seed, protocole, golden queries | ✅ Done (2026-09-22) | Opus (agent) + Fable (docs) |
| E01-S05 | Restitution dans mcp-patterns.md, CLAUDE.md et le template | ✅ Done (2026-09-22) — campagne jouée (Claude Code headless, claude.ai et ChatGPT pilotés par navigateur, Desktop partiel) | Opus |

| E04-S01 | Socle proto : schéma, données Acme et Delta, identité par URL, six outils, context, ctx, feedback, journal | ✅ Done (2026-09-23) | Opus |
| E04-S02 | Routage lexical et find | ✅ Done (2026-09-23) | Opus |
| E04-S03 | read et write | ✅ Done (2026-09-23) | Opus |
| E04-S04 | call : catalogue, tableaux, connecteurs simulés, droits, confirmation, sondes | ✅ Done (2026-09-23) | Opus |
| E04-S05 | Prompts suggérés, variantes de mesure, golden queries proto | ✅ Done (2026-09-23) | Opus |
| E04-S06 | Campagne Claude Code headless | ✅ Done (2026-09-23) | Fable |
| E04-S07 | Campagne claude.ai et ChatGPT, restitution | ✅ Done (2026-09-23) | Fable + JB (comptes) |

### Branche `e03-oauth` — E03 en parallèle d'E04 (worktree `C:\apps\mcp-test-e03`, session Fable, cadrage 2026-09-23)

| ID | Titre | Statut | Assigné |
|----|-------|--------|---------|
| E03-S01 | Schéma `oauth_test`, seed, scripts, journal | ✅ Done (2026-09-23, review + corrections) | Opus (agent) |
| E03-S02 | Serveur MCP protégé par hôte : métadonnées, 401, jeton, appartenance, whoami et echo | ✅ Done (2026-09-23, review + corrections) | Opus (agent) |
| E03-S03 | Connexion, consentement, clients autorisés | ✅ Done (2026-09-23, review + corrections) | Opus (agent) |
| E03-S04 | Déploiement de préversion, réglages Vercel et Supabase, protocole | 🔵 In Progress (domaines, variables Preview, protocole §9 faits ; préversion après le premier commit ; réglages Supabase à JB) | Fable + JB (comptes) |
| E03-S05 | Campagne Claude Code | 🟢 Ready (après S04) | Fable + JB (connexion) |
| E03-S06 | Campagne claude.ai et ChatGPT, restitution et verdict | 🟢 Ready (après S05 et E04-S07 : même navigateur) | Fable + JB (comptes) |
| E03-S07 | Fonctions d'observation et de révocation (clients enregistrés, sessions, révocation) | ✅ Done (2026-09-23, v2 avec `oauth_authorizations` / `oauth_consents`) | Opus (agent) |


### Hors sprint
- E02-S01 Transport stateful (Draft)
