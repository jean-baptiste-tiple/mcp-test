# Résultats — serveur proto (E04)

> Preuves 9 à 12 du brief E04 et sept mesures du doc fonctionnel, host par host. Chaque fait cite sa source : le journal `proto.journal` (requêtes R1–R6 de `docs/bench/protocol.md` §8) ou le flux `stream-json` du run. Le récit du modèle n'est jamais une preuve seul.
> Prompts : `docs/proto-golden-queries.md`. Serveur : `https://mcp-test-navy.vercel.app/api/proto/u/jb/mcp` (Acme) et `…/u/jb-delta/mcp` (Delta), commit `a6667b0`, données `pnpm proto:seed` du 2026-09-23 13:49.

## Empreintes des hosts et modèles

| Host | client_name (R1) | Modèles | Pilotage | Date |
|------|------------------|---------|----------|------|
| Claude Code headless | `claude-code@2.1.280` | Opus 5.5 (`claude-opus-5-5`), Sonnet 5 (`claude-sonnet-5`), Fable 5.1 (`claude-fable-5-1`) | `claude -p` par prompt, session neuve ; tour 2 par `--resume` ; `--tools ""` (aucun outil interne), `--strict-mcp-config` avec les deux serveurs, `--permission-mode bypassPermissions`, dossier de travail vide (ni CLAUDE.md du dépôt ni mémoire de projet) | 2026-09-23, 13:50–14:30 (heure de Paris ; le journal est en UTC) |
| claude.ai | — | — | À jouer avec JB (S07) | — |
| ChatGPT | — | — | À jouer avec JB (S07) | — |

Claude Code fait à chaque session `initialize`, `tools/list` **et `prompts/list`** sur chacun des deux serveurs (176 de chaque, R1). Le CLI 2.1.263 refusait Opus 5.5 (« version 2.1.280 or newer is required ») : mis à jour avant la campagne.

## Grille Claude Code — golden queries (3 modèles, session neuve par prompt)

Lecture : séquence des appels vue dans le flux du run et retrouvée au journal (R2). `δ` = connecteur Delta ; `!` = `confirm: true` ; `✗` = refus du serveur. « Avant l'action » = appels avant la première fonction qui écrit ou envoie.

| # | Opus 5.5 | Sonnet 5 | Fable 5.1 | Verdict |
|---|----------|----------|-----------|---------|
| D1 relance devis | context → list_estimates → read modèle → 4 × create_draft → **stop, demande l'accord** | idem | idem | ✓ 3/3 : bonne procédure, 3 appels avant la première action (la lecture du modèle est une étape de la procédure), aucun envoi |
| D1 tour 2 « Oui, envoie-les. » | 4 × send_draft **sans** confirm (récapitulatifs) puis 4 × avec confirm | 4 × send_draft avec confirm | 4 × send_draft avec confirm | ✓ 3/3 : `confirm: true` seulement après l'accord (R3 : 16 appels, les 4 sans confirm d'Opus à 14:02:40–43, tous les `confirm` après) |
| D2 réponse ticket | context → read faq → demande l'email | context ×2 → read faq → demande l'email | context → read → find ×2 → read → list_estimates → **create_draft** (a retrouvé l'email dans Sellsy) | ✓ bonne procédure 3/3 ; brouillon créé seulement par Fable ; aucun envoi |
| D3 préparer rdv | context → **δcontext** → list_estimates → get_estimate 041 → read → table.rows → read | context → list_estimates → get_estimate | context → δcontext → list_estimates → find → read → get_estimate → table.rows → 4 × read | ✓ 3/3 fiche produite, lecture seule |
| D4 qualifier prospects (v1 des données) | context → schema → claim → find → list_estimates → write → **release ✗ ×3** → feedback | idem, puis release réussi ×3 avec un autre état | idem (avec 6 lectures de plus), feedback, puis release ×3 | Défaut de nos données : l'étape 5 demandait `state: "en cours"`, que le serveur réserve à `claim` (règle ajoutée en review S04). Refus actionnable reçu 3/3 ; 2 modèles se rattrapent, Opus ouvre un ticket (FB-0080, FB-0081) |
| D4 rejoué (procédure corrigée : retour « à traiter ») | context → schema → claim → find → list_estimates → write → release ×3 | idem (+ read) | idem (+ find, read, rows, get_estimate) | ✓ 3/3, 0 erreur |
| D5 point pipeline | context → δcontext → aggregate → list_estimates → synthèse, **demande avant Slack** | context → aggregate → list_estimates → idem | context → δcontext → aggregate → list_estimates → idem | ✓ 3/3, aucun `slack.post_message` sans accord |
| D6 tournées (Delta) | δcontext → δfind → δread → δfind ×3 → **δfeedback** | δcontext → δfind ×6 → δread → δfind ×4 → demande les données | δcontext → δfind ×2 → δread → δfind ×5 → δread → δfind ×4 → δfeedback | Bonne procédure 3/3, mais **défaut de nos données** : Delta n'a ni table ni fonction de livraisons ; jusqu'à 11 `find` avant de conclure (FB-0078, FB-0079) |
| D6 rejoué (tableau `exploitation/livraisons` ajouté) | δcontext → δtable.rows → répartition proposée, **demande l'accord** avant d'écrire | idem | non rejoué | ✓ 2 appels avant la première action, aucune écriture ni Slack sans accord |
| I1 devis sans réponse | context → read ×2 → list_estimates | context → **demande** laquelle des deux procédures | context → read ×3 → list_estimates | ✓ 3/3 (les deux issues sont justes), aucun envoi |
| I2 prospects à Valbrune (sans procédure) | context → δcontext → read → **table.rows filter ville** | context → read → table.rows | context → read → table.rows | ✓ 3/3 : 3 lignes, arguments valides ; `find` inutile, le pointeur « prospects » de context suffit |
| I3 prix pré-étude | context → read grille | idem | idem | ✓ 3/3 : 1 500 € HT |
| I4 colis non arrivé (Delta) | δcontext → **demande confirmation** de la procédure | idem | δcontext → δread ×3 → δfind → demande les infos | ✓ 3/3 bonne procédure, aucun `acme_*` |
| N1 heure à Tokyo | aucun appel | aucun appel | tentative `Bash` (refusée : outils internes coupés), aucun appel MCP | ✓ 3/3 |
| N2 haïku | aucun | aucun | aucun | ✓ |
| N3 traduction | aucun | aucun | aucun | ✓ |
| X1 coupure sur deux sites | context (Acme) → propose escalade_incident | idem | context → read | ✓ 3/3 Acme seul |
| X2 retard de livraison | δcontext | δcontext | δcontext → δread ×2 → δfind ×3 | ✓ 3/3 Delta seul |
| X3 message Slack (ambigu) | **aucun appel**, demande quel espace | context (Acme) → demande | context → δcontext → find → δfind → read → δread → demande | ✓ 3/3 aucun envoi, question posée |

**Preuve 9** — `<prefix>_context` est le premier appel de **39 conversations de travail sur 39** (D, I, X, mesures), sans que le prompt nomme un connecteur. Sur 13 d'entre elles (Opus 8, Fable 5, Sonnet 0), le modèle appelle **aussi** l'autre `context` avant d'agir (`delta_context` 17 fois sur la campagne, R1) : les deux instructions serveur disent « call X_context first in every conversation », et rien ne dit lequel appeler quand deux clients sont branchés.

**Preuve 10** — Golden queries : bonne procédure 3/3 sur D1–D6, I1–I4. Deux appels avant la première action : oui quand la procédure n'impose pas de lecture (D5, D2) ; trois sur D1 parce que l'étape 3 fait lire le modèle d'email. Accord demandé avant tout envoi : 3/3 (aucun `send_draft` ni `post_message` avant le tour d'accord, R3).

**Preuve 11** — Demande sans procédure (I2) : `context` (aucune étape servie) → `read` du tableau → `table.rows` avec `filter: {ville: "Valbrune"}` valide, 3/3, 0 erreur. `find` n'a pas servi : le bloc « By topic » de context pointe déjà le tableau.

## Les sept mesures — Claude Code

| # | Mesure | Résultat Claude Code | Source |
|---|--------|----------------------|--------|
| 1 | Phrase dans les préférences (`--append-system-prompt`) | Sans effet mesurable : `context` était déjà premier sans la phrase (39/39). Avec la phrase, I1 et I2 donnent les mêmes séquences (Opus s'arrête après `context` sur I1 et demande, comme Sonnet). À mesurer là où ça compte, claude.ai et ChatGPT | runs `*-M1-prefs-*` |
| 2 | Prompts suggérés | Listés à chaque session (`prompts/list` 176 = `initialize`). Exposés comme commandes : `/mcp__acme__relance_devis` déclenche `prompts/get` (2 au journal) puis la procédure entière (context → list_estimates → read → 4 × create_draft → demande d'accord), sur Opus et Sonnet | R1, runs `*-M2-prompt` |
| 3 | Taille max d'un résultat lu en entier | **Entier jusqu'à 45 000 caractères** (dernier canari `[C:proto:044000]` cité, Opus). À 50 011, Claude Code ne transmet plus le résultat : « enregistré dans un fichier », que le modèle ne peut pas ouvrir sans outil de fichiers (FB-0083 de Sonnet). 100 000 et 200 000 : idem. Sonnet à 50 000 : réponse bloquée par ses garde-fous (« safeguards flagged this message »). Le budget de 20 000 caractères de context est donc lu en entier (taille servie : p50 4 946, max 6 748) | R4 ; runs `*-M3-*` |
| 4 | Taille max d'arguments écrite en un appel | Opus : 2 179, 8 291, 19 140, **47 751 caractères reçus en un appel** ; Fable : 7 992, 17 786 puis 19 973. Aucune coupe : le serveur reçoit ce que le modèle écrit, jusqu'à ~50 000 | R4 `args_chars` |
| 5 | Expiration du ctx en pleine conversation | **3/3** : au tour 2, après `rules bump`, premier appel refusé « context has changed, call acme_context again » → le modèle **rappelle `context` de lui-même**, un seul essai, puis reprend (`get_estimate` réussi). Coût : 1 erreur + 1 appel | R2 (14:11–14:13), runs `*-M5-t2` |
| 6 | Description de context avec les domaines | Non mesurable sur Claude Code headless (pas d'autres connecteurs que les nôtres). Mesuré indirectement : avec les domaines, X1 et X2 vont au bon client 6/6, X3 (ambigu) est posé en question 3/3. À jouer sur claude.ai avec les connecteurs de JB | runs `*-X*` |
| 7 | Ton servi par context | Tutoiement et signature « — ton assistant Acme » **adoptés sur 100 % des réponses Acme** des trois modèles (I3, D1, D3, D5, M4, rapports de frictions compris) ; absents à juste titre sur Delta (profil sans signature) et sur les négatifs. Une seule consigne, dans le bloc personne, sans rappel | `analyze.mjs` sur les `final`, colonne sign |

Latence (R5) : `context` p50 **694 ms**, p90 1 131 ms, max 5,9 s (75 appels) ; taille servie p50 4 946 caractères.

## Frictions (rapports P15 des trois modèles, recoupés avec le journal)

| Friction | Opus | Sonnet | Fable | Journal / verdict |
|----------|------|--------|-------|-------------------|
| « call X_context first in every conversation » sur les deux serveurs : lequel appeler ? Rien ne dit qu'un serveur est hors sujet | F1 | Issue 3 | oui | Confirmé : 13 conversations appellent les deux `context`. Coût : un `context` de trop (~5 000 caractères). Sonnet n'appelle jamais Delta pour une demande Acme |
| Le connecteur mail simulé n'est annoncé qu'après l'envoi (« sent … nothing left the server ») | F5 | Issue 2 | oui | Vrai, propre à la maquette : le mode simulé n'est ni dans context ni dans le récapitulatif |
| Deux accords : la procédure fait approuver les brouillons, puis `send_draft` redemande un récapitulatif. Sonnet et Fable passent `confirm: true` directement après le « oui » ; Opus rejoue le récapitulatif | F4 | — | « confirm handshake is not enforced » | Vrai : le serveur accepte `confirm: true` sans appel préalable. Aucun envoi avant l'accord de l'utilisateur, la garde tient là où elle compte |
| Objet de l'email différent entre l'étape 3 et le modèle `ventes/modele_relance` ; date sans format ; pas de signature | F2, F3 | — | oui | Vrai, données de la maquette |
| Résultats en prose : dates, montants et emails à extraire du texte | F7 | Issue 1 | oui | Vrai par construction (même chaîne en texte et en structuré). Les trois modèles ont extrait juste, mais le demandent en JSON |
| Droits multi-équipes : Conseil (sellsy read) par défaut, Ventes (sellsy write) aussi ; quelle équipe porte l'appel ? | F8 | — | oui | Le serveur choisit la première équipe qui a le droit ; context ne le dit pas |
| Descriptions Acme et Delta identiques au préfixe près ; `delta_call` cite `sellsy.list_estimates` en exemple | — | — | oui | Vrai : exemples de description non calculés par client |
| Résultat de 50 000+ caractères rangé dans un fichier, inaccessible sans outil de fichiers | — | FB-0083 | — | Comportement du host |
| Interruptions du host : une réponse « coupée par un classifieur » (Fable, rapport), un « filtre de sécurité » pendant `acme_context` (Opus M3-100 000, appel jamais parti), garde-fous Sonnet à 50 000 (canaris pris pour du code) | — | — | — | 3 sur ~90 runs, aucun lié au serveur |
| Pas de mémoire de relance : la procédure relancerait les mêmes devis demain | — | — | oui | Vrai, données de la maquette |
| Retours par `feedback` : 6 tickets (FB-0078 à 0083), dont 4 sur les deux défauts de données (D6 sans table de livraisons, D4 état « en cours ») et un « Placeholder » vide (Sonnet, FB-0082) | | | | R6 |

Ce que le journal contredit ou nuance : Fable dit que « le serveur devrait rejeter un confirm sans appel préalable » ; c'est un choix, pas un défaut (voir Changements proposés). Aucun rapport n'invente un appel : les 3 déroulés collent au journal appel par appel.

## Changements proposés aux deux docs d'architecture

| Doc, section | Aujourd'hui | Proposé | Mesure qui le justifie |
|--------------|-------------|---------|------------------------|
| Fonctionnel, « Les six outils » et « Un serveur pour tous les clients » | Première phrase de context : « Loads your work context at <client> (<domaines>) … call it first in every conversation » | Ajouter la borne : « Call it only when the request concerns <client>'s work: <domaines>. Otherwise do not call it. » et servir des exemples de fonctions **par client** dans les descriptions de call | Preuve 9 : 13/39 conversations appellent les deux context ; friction F1 / Issue 3 ; Fable : exemples Sellsy sur Delta |
| Fonctionnel, « Ce que renvoie context », bloc équipe | Connecteurs listés par équipe | Dire **l'équipe qui portera chaque appel** (« sellsy : Ventes (write) »), et le mode de chaque connecteur (« simulé », « sandbox ») | F8, F5, Issue 2 |
| Fonctionnel, « Observabilité et sécurité », actions sensibles | « un récapitulatif nominatif, puis l'appel avec confirm après l'accord explicite » | Préciser que l'accord donné sur les brouillons vaut pour l'envoi : l'étape d'une procédure qui fait approuver le contenu **est** le récapitulatif ; `confirm: true` direct est alors correct. Garder le serveur permissif (aucun envoi non approuvé en 3/3) | D1 tour 2, F4 |
| Fonctionnel, « Ce que renvoie context », budget | 20 000 caractères, plafond réel à mesurer (mesure 3) | Sur Claude Code, un résultat est lu en entier jusqu'à 45 000 caractères et perdu au-delà de 50 000 : le budget de 20 000 tient avec marge ; **plafonner tout résultat de read et de call à 45 000** (section, page de lignes, contrat) | Mesure 3 |
| Fonctionnel, « Lire et écrire à moindre coût », mesures 3 et 4 | Tailles à mesurer | Un appel peut porter ~50 000 caractères d'arguments sur Claude Code (Opus 47 751) : les morceaux de write peuvent viser 20 000 sans risque | Mesure 4 |
| Fonctionnel, « Mises à jour sans geste » | « le modèle se rafraîchit seul » (hypothèse) | Confirmé 3/3 : un seul refus « context has changed » suffit, le modèle rappelle context et reprend. À garder tel quel, statut mesuré | Mesure 5 |
| Fonctionnel, « Les six outils », résultats | Même contenu en texte et en structuré | Garder, mais mettre dans `structuredContent` **les données** (lignes, devis, ids) en plus du texte : les trois modèles extraient les champs de la prose et le signalent | F7, Issue 1 |
| Fonctionnel, « Routage des intentions », niveau 1 (phrase dans les préférences) | Levier à mesurer | Sans effet sur Claude Code (context déjà premier 39/39). Reste à mesurer sur claude.ai et ChatGPT | Mesure 1 |
| Technique, « Le paquet », prompts suggérés | Prompts = contenu de l'organisation | Confirmé utile sur Claude Code : commande `/mcp__<serveur>__<prompt>` qui déroule la procédure ; Claude Code lit `prompts/list` à chaque session (coût nul côté modèle) | Mesure 2 |
| Technique, « Entités », procédures | Étapes avec l'appel exact | Ajouter un **contrôle à la publication** : chaque `state`, fonction et argument cité par une étape doit exister et être accepté par le serveur (l'étape 5 de qualifier_prospects citait un état que table.release refuse) ; la maquette a produit 9 refus et 2 tickets avant correction | D4 |
| Technique, « Sécurité et isolation », coffre / connecteurs | — | Le mode d'un connecteur (réel, sandbox, simulé) est une donnée servie par context et rappelée par le récapitulatif d'une fonction sensible | F5, Issue 2 |

## Reste à faire (S07, avec JB)

claude.ai (deux modèles) et ChatGPT (défaut et raisonnement) : mêmes golden queries, mesures 1 (phrase dans les préférences et instructions personnalisées), 2 (affichage des prompts), 6 (domaines face aux autres connecteurs de JB), rapports de frictions. Avant : `pnpm proto:seed`, puis ajout des connecteurs Acme et Delta sur les deux comptes.
