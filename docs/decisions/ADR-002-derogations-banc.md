# ADR-002 — Dérogations aux règles MCP produit pour le banc de test

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-22 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Les règles MCP du CLAUDE.md et de mcp-patterns.md sont écrites pour un produit : tools authentifiés OAuth 2.1, chaîne `schema Zod → service → tool`, `service_role` interdit, widgets dual-host, ≤ 10 tools. Le banc n'est pas un produit : il n'a aucune donnée utilisateur, ses tools sont l'objet mesuré (ils doivent être créés par centaines et modifiés sans redéploiement), et ses résultats servent à corriger ces mêmes règles.

## Décision

Pour le périmètre du banc (ce dépôt) :

1. **Serveur public** : `/api/mcp` sans authentification en phase 1. L'OAuth devient une variable de test en E03, pas un prérequis.
2. **Tools = données** : `bench_tools` porte name, description, `input_schema` en JSON Schema brut, annotations. Le code ne contient que quatre handlers (echo, whoami, mutate, readme). Pas de chaîne Zod → service → tool pour les tools générés ; Zod reste obligatoire pour la seule mutation réelle (`bench_mutate`).
3. **Clé secrète Supabase côté serveur** dans `src/lib/supabase/admin.ts`, seul point d'accès aux tables du banc. RLS activé sans policy sur les trois tables : aucun accès par clé publique.
4. **Pas de widgets**, pas de `securitySchemes`, pas de `/.well-known/oauth-protected-resource` en phase 1.
5. **Nombre de tools libre** : le plafond de 10 est une variable mesurée, pas une règle.
6. **Pas de rate limiting** : URL non publiée, journal filtrable par empreinte.

Toute réutilisation de ce code dans un produit rouvre chacun de ces points.

## Conséquences

### Positives
- Une modification de tool coûte une ligne en base, sans build ni déploiement.
- Le catalogue (500 tools, descriptions de 32 ko) se génère par script.

### Négatives
- N'importe qui connaissant l'URL peut appeler les tools et écrire dans le journal ; accepté, le journal se filtre par user-agent et IP.
- Le code du banc n'est pas un exemple de produit MCP : le README le dit.

### Neutres
- Les sondes étant des lignes, leurs métadonnées sont elles-mêmes testables.

## Alternatives considérées

### Tools statiques dans le code, redéploiement à chaque changement
Rejeté : une itération coûte un build Vercel (1 à 2 min) et confond « le host cache » avec « le déploiement n'est pas encore live ».

### RLS avec policies ouvertes et clé publique
Rejeté : équivalent en exposition, mais disperse l'accès ; la clé secrète dans un seul fichier serveur est plus lisible et plus facile à retirer.

### OAuth dès la phase 1
Rejeté : page de consentement, login et DCR = le plus gros chantier UI du projet, sans lien avec les premières mesures ; les trois hosts acceptent un serveur sans auth.
