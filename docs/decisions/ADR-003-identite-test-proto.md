# ADR-003 — Serveur proto : identité de test par segment d'URL

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB (autonomie donnée le 2026-09-23), Claude |

## Contexte

L'epic E04 monte dans le banc une maquette de la plateforme MCP d'entreprise (six outils `acme_*`, code ctx, routage serveur). Chaque appel doit savoir **qui** appelle : l'organisation, l'équipe et la personne décident du contexte servi, des droits et du journal. La cible prévoit OAuth 2.1 ; dans le banc, OAuth est l'epic E03, toujours Draft. Les trois hosts acceptent un serveur sans authentification (mesuré en E01).

## Décision

1. **L'utilisateur est le segment d'URL** : `/api/proto/u/<utilisateur>/mcp`. `<utilisateur>` est le `slug` d'une ligne `proto.users` (unique sur toute la base). Slug inconnu : erreur JSON-RPC à l'`initialize` et à tout appel, sans rien divulguer d'autre.
2. **Aucune authentification** : quiconque connaît l'URL agit comme cet utilisateur. Accepté parce que toutes les données du schéma `proto` sont fictives (Acme Énergies) et les connecteurs simulés, sans réseau.
3. **Accès base par la clé secrète**, comme le banc (ADR-002 §3) : `src/lib/supabase/admin.ts` reste le seul point d'accès runtime ; RLS activée sur chaque table de `proto`, sans policy ; schéma `proto` exposé à PostgREST pour `service_role` seulement (grants), jamais à `anon` ni `authenticated`. Les droits d'équipe (lecture, écriture, fonctions) sont vérifiés par les services, pas par la RLS : sans jeton utilisateur, la RLS ne peut pas les porter.
4. **Un connecteur par utilisateur et par host** : pour changer d'utilisateur, on ajoute un autre connecteur avec une autre URL. L'organisation vient de l'utilisateur : les deux clients fictifs, Acme (`acme_`) et Delta (`delta_`), se branchent dans le même host par deux URL, `/api/proto/u/jb/mcp` et `/api/proto/u/jb-delta/mcp`.

## Conséquences

### Positives
- Tester un autre utilisateur, une autre équipe ou un refus de droits coûte une URL, sans page de connexion.
- Le code des services reçoit déjà `{ orgId, userId, teamId }` : brancher OAuth plus tard ne change que la résolution de l'identité dans la route.

### Négatives
- Aucune preuve d'identité : l'endpoint n'est pas un exemple de produit. Le README et l'en-tête de la route le disent.
- La RLS ne teste pas les règles d'accès par équipe de la cible (hors jeton utilisateur) ; la maquette ne prouve rien sur cette partie.
- L'endpoint public écrit sans limite dans la base partagée du banc (`ctx`, `journal`, `feedback`, brouillons), et les slugs se devinent (`jb`). Accepté pour une maquette ; `pnpm proto:seed` purge tout ce qui dépend des orgs `acme` et `delta`.

### Neutres
- Le journal porte l'utilisateur du segment et l'user-agent : le recoupement par host reste possible.

## Alternatives considérées

### OAuth Supabase (E03)
Rejeté pour la maquette : page de consentement, DCR et login pèsent plus que les six outils, et aucune des huit preuves ni des sept mesures ne dépend de l'authentification.

### En-tête `X-User` ou argument `user` dans chaque outil
Rejeté : claude.ai et ChatGPT ne permettent pas d'ajouter un en-tête à un connecteur personnalisé ; un argument ajouterait un champ que le modèle remplirait, ce que la cible interdit (l'identité ne passe jamais par le modèle).

### Jeton statique en paramètre de requête (`?key=`)
Rejeté : même niveau de preuve qu'un segment d'URL, et certains hosts retirent la chaîne de requête de l'URL d'un connecteur.
