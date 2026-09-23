# Résultats E03 — authentification des assistants (OAuth 2.1 avec Supabase)

> Rempli en suivant `docs/bench/protocol.md` §9. Chaque case porte la date (AAAA-MM-JJ), le `client_name@client_version` journalisé et la requête (`O1` à `O7`) ou la ligne de `oauth_test.journal` qui la produit. Une case vide = non mesuré. Le verdict va dans ADR-004 ; les changements proposés au doc technique, en dernière section. Aucun jeton, secret, mot de passe ni lien magique ici.

## Serveur et comptes

| Élément | Valeur | Depuis |
|---------|--------|--------|
| Hôte Acme | `https://mcp-test-acme.vercel.app/api/auth-test/mcp` (`acme_whoami`, `acme_echo`) | domaine rattaché à `e03-oauth` le 2026-09-23 |
| Hôte Delta | `https://mcp-test-e03-delta.vercel.app/api/auth-test/mcp` (`delta_whoami`, `delta_echo`) | idem (`mcp-test-delta.vercel.app` appartient à une autre équipe) |
| Serveur d'autorisation | `https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1` (enregistrement dynamique, PKCE S256, `offline_access`, JWKS ES256) | relu le 2026-09-23 |
| Page de consentement | `/oauth/consent` sur l'adresse de site du projet Supabase (= hôte Acme pendant la campagne) | |
| Comptes | JB (membre d'Acme et de Delta) ; alias `jean-baptiste+acme@tiple.io` (membre d'Acme seulement) | seed S01 |
| Protection Vercel | « Standard » : URL de déploiement et de branche en 302 le 2026-09-23 ; domaines rattachés : à mesurer après le premier déploiement | |

## Réglages faits (heure, qui, quoi)

| Date, heure | Qui | Réglage | Relu |
|-------------|-----|---------|------|
| 2026-09-23 | pilote | Vercel : domaines `mcp-test-acme.vercel.app` et `mcp-test-e03-delta.vercel.app` rattachés à `e03-oauth` ; variables Preview `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `BENCH_ACK_SECRET` (CLI, valeurs jamais affichées) | `vercel env ls preview` |
| | JB | Supabase : adresse de site, URLs de redirection | |

## Empreintes des hosts (O1)

| Host | Modèle (tag `note`) | client_name@client_version | user_agent, IP | Date |
|------|---------------------|----------------------------|----------------|------|
| Claude Code (CC) | | | | |
| claude.ai (CW) | | | | |
| ChatGPT (GPT) | | | | |
| Claude Desktop (CD) | | | | |
| Claude mobile / ChatGPT mobile | | | | |

## Preuves sans host (Vitest)

| # | Preuve | Test | Résultat | Date |
|---|--------|------|----------|------|
| 1 | Sans jeton, jeton invalide, expiré ou d'une autre clé : 401, `WWW-Authenticate` vers les métadonnées du bon hôte | `tests/unit/auth-test-route.test.ts` | | |
| 2 | Chaque hôte publie sa propre ressource (racine et variante suffixée) | `tests/unit/auth-test-metadata.test.ts` | | |
| 3 | Membre : whoami rend la bonne organisation et le bon préfixe ; non-membre : refus nommant l'organisation, sans donnée | `tests/integration/auth-test-server.test.ts` | | |
| 4 | Membre retiré : appel suivant refusé, même jeton | `tests/integration/auth-test-server.test.ts` | | |
| 4 bis | RLS : le jeton d'un utilisateur ne lit que ses appartenances | `tests/integration/auth-test-schema.test.ts` | | |

## Matrice host × preuve (5 à 11)

Case = résultat en une ligne · date · client · requête. « Échec » = le point exact et le message du host.

| # | Preuve | CC | CW | GPT | CD | Mobiles |
|---|--------|----|----|-----|----|---------|
| 5 | Parcours complet : découverte (forme d'URL des métadonnées lue), enregistrement dynamique, connexion, consentement, outils listés, appel réussi | | | | | |
| 6 | Acme et Delta côte à côte : deux enregistrements, chaque whoami sa propre organisation, aucun mélange ; même jeton présenté aux deux hôtes ? | | | | | |
| 7 | Second utilisateur sur Delta : connexion et consentement passent, `tools/list` servi, appels refusés avec un message clair ; ce que l'host montre | | | | | |
| 8a | Jeton court : l'host rafraîchit seul (401 puis nouvel `exp` au journal) ? | | | | | |
| 8b | Refresh token révoqué (grants, puis sessions) : comportement de l'host | | | | | |
| 9 | Relevé : nom du client, adresse de retour, scopes, `aud`, `client_id`, `resource` ; ce que la page de consentement a vu | | | | | |
| 10 | Reconnexion : métadonnées, `initialize`, `tools/list` relus ou non, par geste | | | | | |
| 11 | Apps mobiles : parcours complet oui / non, point d'échec | | | | | |

## Relevés par host (preuve 9)

| Host | Nom du client enregistré | Adresse de retour | Scopes demandés | `aud` | `client_id` présent | `resource` (visible dans `aud` ? absent ?) | Consentement : ce que la page a vu | Date |
|------|--------------------------|-------------------|-----------------|-------|---------------------|-------------------------------------------|-------------------------------------|------|
| CC | | | | | | | | |
| CW | | | | | | | | |
| GPT | | | | | | | | |
| CD | | | | | | | | |

## Frictions (P15 adapté)

| Date | Host | Friction observée | Cause supposée | Action |
|------|------|-------------------|----------------|--------|

## Verdict

Voir `docs/decisions/ADR-004-auth-assistants-supabase-oauth.md` §Verdict (rempli en E03-S06). Résumé en trois lignes ici une fois posé.

## Changements proposés à la section « Connexion et identité » du doc technique

| Passage visé | Texte actuel | Texte proposé | Mesure qui le justifie |
|--------------|--------------|---------------|------------------------|
