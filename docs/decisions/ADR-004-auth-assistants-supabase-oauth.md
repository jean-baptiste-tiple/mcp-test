# ADR-004 — Authentification des assistants : Supabase serveur d'autorisation OAuth 2.1, organisation par nom d'hôte

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Proposé (verdict attendu en E03-S06) |
| **Décideur(s)** | JB, Claude |

## Contexte

La section « Connexion et identité » du [doc technique de la plateforme](https://claude.ai/artifact/Dumt9aN5erv1eGtiPq14ZK) pose que Supabase Auth, en serveur d'autorisation OAuth 2.1 avec enregistrement dynamique, suffit pour connecter Claude Code, claude.ai et ChatGPT à un serveur MCP servi sur plusieurs sous-domaines, un par client : l'organisation vient de l'adresse appelée, jamais du jeton ; l'appartenance est revérifiée à chaque appel ; en cellule partagée, la page de consentement, unique par projet Supabase et jointe à son adresse de site, vit sur un domaine commun et s'habille selon l'adresse d'origine. Rien de tout cela n'a été testé. Si c'est faux, il faut une façade d'autorisation devant Supabase, et l'architecture change.

Ce que le banc a déjà : le projet Supabase `nwdmkehnxvqyxddgogtu` publie `https://nwdmkehnxvqyxddgogtu.supabase.co/auth/v1/.well-known/oauth-authorization-server` avec `registration_endpoint`, PKCE S256, `grant_types` `authorization_code` et `refresh_token`, scopes `openid profile email phone offline_access`, une JWKS ES256 ; un déploiement Vercel ; les trois hosts branchés. Ce que Supabase documente (2026-09-23) : les jetons d'accès du serveur OAuth sont des JWT Supabase ordinaires (`sub`, `role`, `aud` = `authenticated`, `email`, `client_id`, `session_id`) ; les scopes ne contrôlent que les données OIDC, jamais l'accès aux tables ; les `redirect_uri` d'un client exigent une correspondance exacte ; le paramètre `resource` (RFC 8707) n'est pas documenté.

## Décision

Pour le banc, un serveur MCP de test qui met l'hypothèse en œuvre au plus court, et la campagne qui la juge :

1. **Supabase Auth est le seul serveur d'autorisation.** OAuth 2.1, PKCE, enregistrement dynamique ouvert. Aucune façade, aucun proxy des points OAuth.
2. **Notre serveur est un resource server par nom d'hôte.** `/api/auth-test/mcp` est servi sur deux hôtes (Acme, Delta). Chaque hôte publie ses propres métadonnées RFC 9728 (`/.well-known/oauth-protected-resource`, racine et variante suffixée du chemin), avec `resource` = l'URL du serveur sur cet hôte et `authorization_servers` = le Supabase du banc ; toute requête sans jeton valide reçoit 401 et un `WWW-Authenticate` dont `resource_metadata` désigne l'hôte appelé.
3. **Le jeton dit qui appelle.** Signature vérifiée par la JWKS du projet, `iss` et `exp` exigés ; `aud` et `client_id` sont relevés, pas exigés ; les scopes ne servent pas à autoriser. Le jeton brut n'est jamais journalisé.
4. **L'organisation vient de l'hôte, jamais du jeton.** `oauth_test.orgs.host` → organisation et préfixe des outils. Hôte inconnu : 404.
5. **L'appartenance est relue à chaque `tools/call`**, sous le jeton de l'utilisateur (client Supabase `Authorization: Bearer`, RLS sur `oauth_test.members`), sans cache : retirer un membre refuse l'appel suivant. Non-membre : refus qui nomme l'organisation, aucune autre donnée ; `tools/list` reste servi à tout jeton valide (la connexion passe, les appels sont refusés).
6. **La clé secrète sert au journal, à la résolution de l'organisation par hôte et à la marque de la page de consentement** (ADR-002 §3) : le journal doit enregistrer aussi les refus et les 401, que la RLS ne laisserait pas écrire, et l'hôte se résout avant tout jeton. C'est la seule dérogation à « jamais de `service_role` dans un tool » : aucune donnée de l'utilisateur n'est lue par cette clé (`orgs` n'en contient pas).
7. **La page de consentement vit sur l'adresse de site du projet**, un seul hôte (Acme pendant le banc) : elle affiche ce que `getAuthorizationDetails` donne (client, adresse de retour, scopes, compte) et la marque de l'organisation dont l'hôte est celui de la page. Que le consentement de Delta s'affiche sur l'hôte d'Acme est une mesure, pas un bug à masquer.
8. **Comptes** : JB (membre d'Acme et de Delta) et un alias de JB (membre d'Acme seulement), email et mot de passe, sans signup.

**Ce qui réfute l'hypothèse et impose une façade** (à trancher en E03-S06, par host) : l'enregistrement dynamique ou l'adresse de retour d'un host refusés par Supabase ; un host qui ne suit pas `WWW-Authenticate` ou les métadonnées par hôte ; un consentement impossible à rattacher au client ou à l'organisation demandés ; un jeton non lié à la ressource dont le rejeu entre hôtes serait inacceptable pour la cible ; un rafraîchissement ou une révocation que les hosts ne gèrent pas ; l'unicité de l'adresse de site incompatible avec plusieurs clients dans un même projet Supabase.

## Conséquences

### Positives
- Zéro composant en plus : le Supabase du banc, un route handler, trois tables.
- Les preuves sans host (401 par hôte, métadonnées, appartenance, retrait) tournent en Vitest ; les hosts ne servent qu'à ce qu'ils seuls peuvent montrer.
- Le verdict vaut pour la cible : même serveur d'autorisation, même règle « organisation = adresse », même contrôle d'appartenance.

### Négatives
- Un jeton d'Acme vaut pour Delta si Supabase ignore `resource` : seule l'appartenance protège. Accepté pour le banc, à qualifier dans le verdict.
- La page de consentement d'un client s'affiche sur l'hôte d'un autre : mesuré, puis à juger.
- Les réglages du projet Supabase (adresse de site, durée des jetons) et de Vercel (domaines, exception de protection) sont partagés avec le banc et le proto : chaque changement est annoncé à JB avant.

### Neutres
- Le hook Custom Access Token (claims `org_id`, `user_role` de mcp-patterns §6.4) est hors périmètre : la cible ne met pas l'organisation dans le jeton.
- `/api/mcp` (ADR-002) et `/api/proto/*` (ADR-003) restent sans authentification.

## Verdict (E03-S06)

À remplir : Supabase suffit, ou il faut une façade, et pour quoi ; par host, avec la date et la version cliente journalisée ; changements demandés à la section « Connexion et identité ».

## Alternatives considérées

### Façade d'autorisation devant Supabase
Un serveur OAuth à nous qui délègue la connexion à Supabase et garde la main sur l'enregistrement des clients, les audiences et le consentement. Rejeté tant que rien ne le justifie : c'est précisément ce que l'epic doit établir ; le construire d'abord rendrait la mesure inutile.

### Identité par segment d'URL (ADR-003)
Suffit à la maquette, ne prouve rien sur la connexion des assistants. Rejeté pour E03.

### Une organisation par projet Supabase (cellule dédiée seulement)
Contourne l'adresse de site unique, mais ne teste pas la cellule partagée, cas de la plateforme standard. Rejeté : c'est la cellule partagée qu'il faut prouver.

### Hook Custom Access Token portant l'organisation
Mettrait l'organisation dans le jeton, à l'inverse de la cible (« jamais du jeton »). Rejeté.
