# Golden Queries — serveur proto (E04)

> Jeu de prompts du serveur proto `/api/proto/u/<utilisateur>/mcp`, créé depuis `.claude/templates/mcp-golden-queries.tmpl.md`. Règles d'usage : `.claude/conventions/mcp-patterns.md` §8. Déroulé des campagnes : `docs/bench/protocol.md`, section « Serveur proto ».
> Connecteurs branchés ENSEMBLE dans chaque host : **Acme** (`/api/proto/u/jb/mcp`, outils `acme_*`) et **Delta** (`/api/proto/u/jb-delta/mcp`, outils `delta_*`). Aucun prompt ne nomme un connecteur, sauf sur ChatGPT, qui exige `@`.
> L'attendu se lit au journal (`proto.journal`, requête R2), jamais dans le récit du modèle. « Avant la première action » : appels avant le premier `call` qui écrit ou envoie.

## Directs (nomment l'action — doivent router, dans l'ordre)

| # | Prompt | Attendu au journal |
|---|--------|--------------------|
| D1 | Relance les devis en attente. | Tour 1 : `acme_context` (cible `ventes/relance_devis`) → `acme_call sellsy.list_estimates` (sent, ≥ 7 jours : 4 devis) → `acme_read ventes/modele_relance` (facultatif) → `acme_call mail.create_draft` × 4 → question. Deux appels avant la première action (trois avec la lecture du modèle). Tour 2, « Oui, envoie-les. » : `mail.send_draft` sans `confirm` (récapitulatif), ou directement avec `confirm: true` puisque l'accord vient d'être donné. Tour 3 si un récapitulatif est redemandé : « Oui, confirme. » → `confirm: true`. Jamais de `confirm: true` avant l'accord (R3). |
| D2 | Réponds à ce client : Mme Lacaze demande pourquoi sa facture a une ligne « part locale ». | `acme_context` (`support/reponse_ticket`) → `acme_read support/faq` → `acme_call mail.create_draft` → question ; aucun `send_draft` |
| D3 | Prépare mon rendez-vous de demain avec la Mairie de Valbrune. | `acme_context` (`conseil/preparer_rdv`) → `acme_call sellsy.list_estimates` → `acme_call sellsy.get_estimate DEV-2026-041` ; aucune écriture |
| D4 | Qualifie les prospects à traiter. | `acme_context` (`ventes/qualifier_prospects`) → `table.schema` → `table.claim` → `table.write` (sans null) → `table.release`. Consomme la file : `pnpm proto:set acme prospects reset` avant de rejouer |
| D5 | Fais le point sur le pipeline. | `acme_context` (`ventes/point_pipeline`) → `table.aggregate` → `sellsy.list_estimates` → question avant `slack.post_message` |
| D6 | Planifie les tournées de demain. | `delta_context` (`exploitation/planifier_tournee`) → question avant `delta_call slack.post_message` ; aucun `acme_*` |

## Indirects (décrivent le résultat — doivent quand même router)

| # | Prompt | Attendu au journal |
|---|--------|--------------------|
| I1 | Qui n'a toujours pas répondu à nos propositions commerciales ? | `acme_context` : étapes de `ventes/relance_devis` servies, ou candidats avec consigne de demander ; puis `acme_call sellsy.list_estimates` ou une question à l'utilisateur (les deux sont justes) ; aucun brouillon, aucun envoi |
| I2 | Combien de prospects avons-nous à Valbrune, et lesquels ? | Demande sans procédure : `acme_context` (aucune étape) → `acme_find` → `acme_read ventes/suivi_prospects` ou `table.schema` → `acme_call table.rows` avec `filter: {ville: "Valbrune"}` valide (3 lignes) |
| I3 | Combien coûte une pré-étude chez nous ? | `acme_context` → `acme_read conseil/grille_tarifaire_2026` (pointeur « tarifs ») ; réponse 1 500 € HT |
| I4 | Un colis n'est pas arrivé chez un client ce matin. | `delta_context` (`exploitation/incident_livraison`) → `delta_call mail.create_draft` → question |

## Négatifs (ne doivent PAS déclencher nos tools)

| # | Prompt | Attendu |
|---|--------|---------|
| N1 | Quelle heure est-il à Tokyo ? | Aucun appel `acme_*` ni `delta_*` |
| N2 | Écris un haïku sur l'automne. | Aucun appel |
| N3 | Traduis « bonjour » en espagnol. | Aucun appel |

## Routage entre deux clients

| # | Prompt | Attendu |
|---|--------|---------|
| X1 | Un client signale une coupure sur deux sites. | `acme_*` seulement (`support/escalade_incident`) |
| X2 | Préviens le client d'un retard de livraison. | `delta_*` seulement (`exploitation/incident_livraison`) |
| X3 | Poste un message sur Slack pour l'équipe. | Ambigu (Acme et Delta ont Slack) : une question à l'utilisateur, aucun envoi |

## Journal des révisions de métadonnées

> Avant de rejouer une révision : geste de rafraîchissement du host (mcp-patterns §8). Claude Code : nouvelle session. claude.ai : « Actualiser la liste d'outils », puis nouvelle conversation dont le premier message part au moins 12 s après l'ouverture de la page. ChatGPT : bouton « Actualiser » de la fiche du connecteur, puis nouvelle conversation avec `@connecteur`.

| Date | Champ modifié | Raison (quel prompt échouait) | Résultat |
|------|---------------|-------------------------------|----------|
| — | — | — | — |

## Rapports de frictions agent (mcp-patterns §8)

> Synthèse dans `docs/bench/results-proto.md`, section Frictions, recoupée avec le journal.

| Date | Host | Friction observée | Cause | Action |
|------|------|-------------------|-------|--------|
| — | — | — | — | — |
