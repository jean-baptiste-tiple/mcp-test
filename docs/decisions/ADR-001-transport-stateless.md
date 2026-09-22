# ADR-001 — Transport stateless en phase 1, stateful conditionnel en phase 2

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-22 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Le banc doit mesurer (a) quand les hosts relisent la liste des tools et (b) s'ils honorent `notifications/tools/list_changed`. (a) ne demande aucune session ; (b) exige un flux ouvert vers le client, donc un transport stateful (Redis ou processus persistant). Vercel limite la durée des fonctions et le starter démarre stateless (mcp-patterns §7).

## Décision

Phase 1 (E01) : Streamable HTTP **stateless**, handler créé par requête à partir d'un snapshot en base, aucune session, aucun Redis. `bench_mutate` tente `sendToolListChanged()` et journalise le résultat (`list_changed_sent`), sans promettre la livraison.

Phase 2 (E02, Draft) : passage **stateful** uniquement pour la mesure de `list_changed`, en amendant cet ADR. Deux options, à trancher à l'ouverture de E02 selon la limite de durée Vercel constatée : Redis Upstash avec `redisUrl` dans la route, ou le même serveur lancé en local derrière un tunnel.

## Conséquences

### Positives
- Zéro infrastructure supplémentaire en phase 1 ; scale-to-zero.
- Chaque requête relit la base : une modification est visible à la requête suivante, ce qui est exactement la variable mesurée.

### Négatives
- Aucun `Mcp-Session-Id` : la reconstitution d'une conversation repose sur l'empreinte user-agent plus IP et une fenêtre temporelle.
- Le test `list_changed` est reporté à E02.

### Neutres
- `capabilities.tools.listChanged` est déclaré dès la phase 1 pour observer si un host change de comportement en le voyant.

## Alternatives considérées

### Stateful dès la phase 1 (Redis)
Rejeté : coût et complexité pour une seule mesure, et la majorité des questions du banc se posent en stateless.

### Serveur SDK nu hors Vercel (Fly, Railway)
Rejeté : seconde infrastructure à maintenir ; l'app Vercel existe déjà.
