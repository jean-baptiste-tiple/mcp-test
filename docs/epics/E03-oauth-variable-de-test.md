# Epic E03 — Authentification des assistants : OAuth 2.1 avec Supabase

| Champ | Valeur |
|-------|--------|
| **ID** | E03 |
| **Priorité** | P1 |
| **Statut** | 🔵 In Progress |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **PRD Refs** | FR-AUTH-01 à FR-AUTH-12, NFR-AUTH-01 à 03 |
| **Référence UI** | Description texte : `/login` (starter, email et mot de passe), `/oauth/consent` (client, adresse de retour, scopes, Autoriser / Refuser, marque de l'hôte), `/auth-test/grants` (clients autorisés, révocation) |
| **Dépendances** | E01 ; campagne web (S06) après E04-S07 (même navigateur) |

## Objectif

Prouver ou réfuter, avant tout développement de la plateforme, l'hypothèse « Connexion et identité » du doc technique : Supabase en serveur d'autorisation OAuth 2.1 avec enregistrement dynamique suffit pour connecter Claude Code, claude.ai et ChatGPT à un serveur MCP servi sur un sous-domaine par client, l'organisation venant de l'adresse et l'appartenance étant revérifiée à chaque appel (ADR-004). Sinon, dire ce qu'une façade devrait faire.

## Périmètre

### IN
- Schéma `oauth_test` (organisations avec leur hôte, membres, journal), seed rejouable, script d'ajout et de retrait d'un membre.
- Serveur MCP `/api/auth-test/mcp` sur deux hôtes (Acme, Delta) : métadonnées RFC 9728 par hôte, 401 `WWW-Authenticate`, jeton vérifié par la JWKS, appartenance relue à chaque appel sous le jeton (RLS), outils `whoami` et `echo`, journal.
- Pages `/login` (starter supabase-auth réduit à la connexion), `/oauth/consent`, `/auth-test/grants` ; middleware limité à ces pages.
- Déploiement de préversion de la branche `e03-oauth` sur deux domaines rattachés, réglages Vercel et Supabase avec JB.
- Protocole (`docs/bench/protocol.md` §9), campagne Claude Code puis claude.ai et ChatGPT (Claude Desktop, mobiles si JB), `docs/bench/results-oauth.md`, verdict ADR-004, changements proposés au doc technique.

### OUT
- Signup, mot de passe oublié, lien magique, hook Custom Access Token, jetons de service, connecteur admin.
- Façade d'autorisation : objet du verdict, pas du périmètre.
- Toute modification de `/api/mcp`, `/api/proto/*`, `src/mcp/`, `src/proto/`, des tables `bench_*` et `proto.*`.
- Fusion dans `main` avant la fin d'E04 et l'accord de JB.

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E03-S01 | Schéma `oauth_test`, seed, scripts, journal | M | ✅ | — |
| E03-S02 | Serveur MCP protégé par hôte : métadonnées, 401, jeton, appartenance, whoami et echo | L | ✅ | S01 |
| E03-S03 | Connexion, consentement, clients autorisés | M | ✅ | S01 |
| E03-S04 | Déploiement de préversion, réglages Vercel et Supabase, protocole | M | 🔵 | S02, S03 |
| E03-S05 | Campagne Claude Code | M | 🟢 | S04 |
| E03-S06 | Campagne claude.ai et ChatGPT, restitution et verdict | L | 🟢 | S05, E04-S07 |
| E03-S07 | Fonctions d'observation et de révocation pour la campagne (clients enregistrés, sessions, révocation) | S | ✅ | S01 |

S02, S03 et S07 ne se touchent pas (S02 : `src/auth-test/`, `src/app/api/auth-test/`, `.well-known` ; S03 : `src/app/(auth)/`, `src/app/oauth/`, `src/app/auth-test/`, `src/lib/supabase/`, `src/lib/actions/`, `src/middleware.ts`) : parallélisables après S01. Les dépendances `jose` (S02) et `@supabase/ssr` (S03) sont installées par le pilote avant de lancer les deux lots.

## Historique

- 2026-09-22 : cadrage initial « OAuth Supabase comme variable de test » (P2, Draft, parcours 4.2, une story L : consent, resource metadata, `withMcpAuth` sur `/api/mcp`, `user_id` dans `bench_events`). Remplacé le 2026-09-23 par le périmètre ci-dessus : l'objet n'est plus une variable du banc mais l'hypothèse d'authentification de la plateforme ; `/api/mcp` reste public (ADR-002).
