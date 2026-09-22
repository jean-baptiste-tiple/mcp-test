# Fiche process — campagne restante (2026-09-22)

> Runbook concret, étape par étape, pour finir la campagne sur les quatre hosts : ChatGPT (GPT), Claude Code (CC), claude.ai (CW), Claude Desktop / Cowork (CD). Le protocole générique reste `docs/bench/protocol.md` ; les résultats vont dans `docs/bench/results.md` (je les remplis à partir de ce que tu me colles et du journal).
> Règle de collage : à chaque étape, colle-moi **la réponse complète du host et l'heure**. Je lis le journal `bench_events` derrière chaque geste.

## 0. Ce qui est acquis (ne pas refaire)

| Host | Geste de rafraîchissement mesuré | Instructions exposées au modèle | Descriptions exposées |
|------|----------------------------------|----------------------------------|-----------------------|
| CC | noms : automatique (notification) · définitions et instructions : **nouvelle session**, serveur connecté avant le premier message | oui | entières, après chargement ToolSearch |
| CW | réglages du connecteur → **« Actualiser la liste des outils »**, puis nouvelle conversation | non | ~80 caractères (index différé), entières après `tool_search` |
| GPT | fiche du connecteur → encart « Informations » → **« Actualiser »**, puis nouvelle conversation avec le connecteur activé | non | entières |
| CD | à mesurer (bloc 1) | à mesurer | à mesurer |

Prompts canoniques (copier tels quels) :

- **P0** tag de session : `Call bench_whoami with note "<host>/<modèle>" and paste its full output verbatim.` — tags : `claude-code/opus-5`, `claude-code/sonnet-5`, `claude-code/fable-5`, `claude-web/opus-5`, `claude-desktop/opus-5`, `chatgpt/gpt-5.6-luna`…
- **P2** liste : `List the exact names of every tool you currently have from the bench server. Do not call any tool.`
- **PC** codes (remplace P3/P8, ChatGPT refuse « quote verbatim ») : `Which bracketed codes of the form [C:...] appear in the descriptions of the bench tools you can see? List them with the tool name.` — sur CC ajouter `You may load the tool definitions with ToolSearch first.`
- **P6** instructions (CC seulement) : `Quote verbatim the instructions of the bench server, including any bracketed codes. Do not call any tool.`
- **P5** appel : `Call <tool> with message "hello".`
- **P12** readme neutre : `Use the bench server to echo the message "hello".`
- **P13** readme suite : `Now echo "again".`
- **P14** readme contrôle : `Did you read a readme or usage note before using the bench server? Quote the bracketed codes you saw in it.`
- **P15** frictions : `Write a structured friction report about the bench MCP server: step by step what you did, where you hesitated or failed, what you think caused it, and a minimal reproduction for each issue. Mention anything about tool descriptions, instructions or the readme that was unclear, truncated or missing.`

Studio (Supabase → SQL Editor). Activer un scénario, toujours en deux ordres :

```sql
update bench_scenarios set is_active = false where is_active;
update bench_scenarios set is_active = true where slug = '<slug>';
```

Remettre tout d'aplomb (à la fin, ou entre deux blocs) : `pnpm bench:seed` dans le terminal du projet (restaure `baseline` et tous les scénarios, ne touche pas `is_active`, ne touche pas le journal).

---

## 1. Claude Desktop / Cowork — empreinte et rafraîchissement (≈ 20 min)

Le connecteur « test mcp » est celui de claude.ai (même compte) : il doit apparaître dans Claude Desktop sans rien ajouter.

- [ ] 1.1 Ouvrir Claude Desktop, vérifier dans Réglages → Connecteurs que « test mcp » est présent et activé. Noter l'heure d'ouverture de l'app.
- [ ] 1.2 Nouvelle conversation, mode chat classique, modèle Opus 5. **P0** avec `note "claude-desktop/opus-5"`. Colle la sortie et l'heure. → je relève clientInfo / user-agent / séquence de connexion.
- [ ] 1.3 Même conversation : **P2**. Attendu : 7 tools (la liste claude.ai actualisée à 11:52) ou une autre liste si Desktop a son propre cache.
- [ ] 1.4 Même conversation : **PC**. Attendu : `0002` sur `bench_probe_1`, `0001` sur 2 et 3.
- [ ] 1.5 Même conversation : **P6**. Attendu : aucune instruction (comme claude.ai) ou les instructions v2 `0005` (comme Claude Code). C'est LA question pour Desktop.
- [ ] 1.6 Passer en **Cowork** (même app), nouvelle tâche Cowork, **P0** avec `note "claude-cowork/opus-5"` puis **P2**. Colle les deux.
- [ ] 1.7 Mutation depuis Desktop (chat) : `Call bench_mutate with action "create_tool", name "bench_probe_4", description "Probe tool [C:manual:desc:end:0004]. Use this when asked to probe." Then stop.` Noter l'heure. Puis **P2** dans la même conversation (L0), puis un message de plus « Ok » suivi de **P2** (L1), puis nouvelle conversation et **P2** (L2).
- [ ] 1.8 Dans claude.ai (web), réglages du connecteur → « Actualiser la liste des outils ». Puis dans Desktop, nouvelle conversation, **P2**. Attendu : si Desktop partage le cache claude.ai, `bench_probe_4` apparaît ; sinon, chercher un bouton équivalent dans Desktop et le noter.
- [ ] 1.9 Quitter et relancer Desktop, nouvelle conversation, **P2** (L5). Colle.

Ce que je remplis : ligne CD des empreintes, colonne CD des grilles A et B (M1), grille C « instructions exposées ».

---

## 2. Mutations restantes M3, M4, M6 (≈ 30 min, les quatre hosts)

Principe : **une seule mutation**, faite depuis Claude Code (ça mesure en même temps sa réaction à la notification), puis sur chaque autre host : contrôle **avant**, geste de rafraîchissement, nouvelle conversation, contrôle **après**.

### M3 — schéma d'un tool existant

- [ ] 2.1 Claude Code, session courante : `Call bench_mutate with action "update_tool", name "bench_echo", input_schema {"type":"object","properties":{"message":{"type":"string","description":"Text to echo back"},"mode":{"type":"string","enum":["fast","slow"],"description":"Speed mode [C:manual:schema:end:0003]"}},"required":["message","mode"]}. Then stop.` Noter l'heure.
- [ ] 2.2 Claude Code, même session : `You may load the tool definition with ToolSearch first. Which bracketed codes appear in the input schema of bench_echo, and which properties are required?` Attendu (hypothèse) : ancien schéma (définition figée). Puis `Call bench_echo with message "hello".` → je regarde dans le journal si `mode` est envoyé.
- [ ] 2.3 Claude Code, **nouvelle session** (attendre `bench` connecté dans `/mcp`) : même question sur le schéma, puis `Call bench_echo with message "hello".` Attendu : `0003`, `mode` requis, et le modèle fournit `mode` (ou le serveur reçoit un appel sans `mode` : le serveur ne valide pas les args des tools echo, c'est le host qui décide).
- [ ] 2.4 claude.ai : conversation courante, question schéma (avant). Puis « Actualiser la liste des outils », nouvelle conversation, question schéma (après), puis `Call bench_echo with message "hello".`
- [ ] 2.5 ChatGPT : idem avec le bouton « Actualiser » de la fiche, nouvelle conversation avec le connecteur activé.
- [ ] 2.6 Desktop : idem avec le geste trouvé en 1.8.

### M4 — tool désactivé

- [ ] 2.7 Claude Code, session courante : `Call bench_mutate with action "disable_tool", name "bench_probe_2". Then stop.` Noter l'heure. Puis **P2** (attendu : `bench_probe_2` disparu, notification) puis `Call bench_probe_2 with message "hello".` (attendu : refus du host, ou erreur serveur « Unknown tool »).
- [ ] 2.8 claude.ai : **P2** puis `Call bench_probe_2 with message "hello".` **avant** rafraîchissement (attendu : le host l'a encore ; le serveur répond « Unknown tool bench_probe_2. Call tools/list to refresh. » — c'est la mesure « fetché mais périmé »). Puis « Actualiser la liste des outils », nouvelle conversation, **P2**.
- [ ] 2.9 ChatGPT : idem (appel avant, « Actualiser », nouvelle conversation, **P2**).
- [ ] 2.10 Desktop : idem.

### M6 — identité du serveur

- [ ] 2.11 Studio, SQL : `update bench_scenarios set server_name = 'mcp-bench-v2', server_title = 'MCP Bench v2 [C:manual:title:end:0006]' where slug = 'baseline';` Noter l'heure.
- [ ] 2.12 Sur chaque host, **avant** rafraîchissement puis **après** (geste + nouvelle conversation ; Claude Code : nouvelle session) : `What are the name, title and version of the bench MCP server as you see them? Include any bracketed codes. Do not call any tool.` Attendu : le préfixe des tools ne change pas (`mcp__bench__` en CC, `mcp__test__` en CW/GPT viennent du nom local) ; on cherche si `title` ou `name` apparaissent quelque part.
- [ ] 2.13 Remettre l'identité : `update bench_scenarios set server_name = 'mcp-bench', server_title = 'MCP Bench' where slug = 'baseline';` (ou `pnpm bench:seed`, qui remet aussi les descriptions v1, les instructions v1 et supprime les probes : à faire seulement si tu veux repartir de zéro).

---

## 3. Grille C — limites (≈ 15 min par scénario, tous hosts)

Ordre lean (7 scénarios, du plus probable au plus extrême) : `desc_len_8k`, `desc_len_32k`, `many_tools_200`, `name_len_128`, `name_chars`, `schema_shape`, `server_identity`. Puis, si le temps le permet : `desc_len_2k`, `many_tools_50`, `many_tools_500`, `name_len_64`, `instr_len_5k`, `instr_len_20k`, `instr_len_50k` (instructions : Claude Code seulement, nouvelle session à chaque fois).

Pour **chaque** scénario :

- [ ] 3.1 Studio : activer le scénario (les deux ordres SQL). Noter l'heure.
- [ ] 3.2 Rafraîchir chaque host : CC nouvelle session ; CW « Actualiser la liste des outils » + nouvelle conversation ; GPT « Actualiser » + nouvelle conversation ; CD geste de 1.8 + nouvelle conversation.
- [ ] 3.3 Sur chaque host, le prompt du scénario :
  - `desc_len_*` : **PC**. Lire quels canaris sont cités pour `bench_desc_probe` : `start`, `middle`, `end` → entier ; `start` seul → tronqué tôt ; rien → description non exposée. Sur CW, ajouter ensuite `Load bench_desc_probe with tool_search, then answer again.` pour distinguer index différé et définition complète.
  - `many_tools_*` : `How many tools does the bench server expose? Give the first five and the last five names. Are any of them deferred or hidden from you?` puis **PC** limité : `Which bracketed codes appear in the descriptions of bench_gen_001 and of the last tool?`
  - `name_len_*`, `name_chars` : `List the exact tool names of the bench server, then call the one whose name is the longest with message "x".` → je compare avec `tool_name` reçu dans le journal (nom tronqué, renommé, refusé).
  - `schema_shape` : `Describe the input schema of bench_shape_deep as you see it (levels, enum values, required fields), then call it with a valid example.`
  - `server_identity` : `What are the name, title and version of the bench MCP server as you see them? Include any bracketed codes.`
  - `instr_len_*` (CC seulement, nouvelle session) : **P6**.
- [ ] 3.4 Colle les réponses des quatre hosts avec l'heure. Je remplis la grille C et la table des tailles (Q4 : `tools_served`, `response_chars`).

---

## 4. Grille D — leviers readme (≈ 10 min par levier et par host)

Sept scénarios : `baseline` (témoin), `readme_instructions`, `readme_descriptions`, `readme_name_first`, `readme_gate`, `readme_ack`, `readme_hub`. Pour chaque scénario, sur chaque host :

- [ ] 4.1 Studio : activer le scénario. Rafraîchir le host (geste du host) et ouvrir une **nouvelle conversation**.
- [ ] 4.2 **Premier message = P12** (jamais de P0 avant : le tag viendrait fausser la mesure du premier usage). Colle la réponse et l'heure. → je lis dans le journal si `bench_readme` a été appelé avant `bench_echo`, et les erreurs (`gate`/`ack`).
- [ ] 4.3 **P13**. → readme rappelé ou non au message suivant.
- [ ] 4.4 **P0** avec le tag du host (`note "<host>/<modèle>"`) pour marquer la conversation a posteriori.
- [ ] 4.5 **P14**. → « a lu » (codes cités) ou seulement « a appelé ».
- [ ] 4.6 Nouvelle conversation, **P12** seul. → readme relu en nouvelle conversation ?
- [ ] 4.7 Pour `readme_ack` : noter si le modèle passe l'`ack` du premier coup, et combien d'appels échouent (je lis `is_error` dans le journal).

Ordre conseillé : `baseline` puis `readme_ack` (le plus fort) puis `readme_instructions` (le plus faible) ; les quatre autres ensuite.

---

## 5. Modèles (≈ 30 min)

Refaire uniquement ce qui dépend du modèle, sur deux hosts qui ont un sélecteur :

- [ ] 5.1 Claude Code : `/model` → Sonnet 5, nouvelle session : **P0** (`claude-code/sonnet-5`), **PC**, **P6**, puis le levier `readme_ack` (4.2 → 4.5). Idem avec Fable 5 (`claude-code/fable-5`).
- [ ] 5.2 claude.ai : sélecteur → Sonnet 5, nouvelle conversation : **P0** (`claude-web/sonnet-5`), **PC**, puis `readme_ack` (4.2 → 4.5). Idem Fable 5 si disponible.
- [ ] 5.3 ChatGPT : second modèle du sélecteur (un modèle de raisonnement), nouvelle conversation : **P0** (`chatgpt/<modèle>`), **PC**, puis `readme_ack`.

Si deux modèles sur le même host divergent sur le même scénario (par exemple un cite le canari `end`, l'autre non), la limite est côté modèle, pas côté host : je le note dans la table « Citation des canaris par modèle ».

---

## 6. Rapports de frictions (≈ 5 min par host)

- [ ] 6.1 Sur chaque host, dans une conversation qui a servi à la campagne : **P15**. Colle les quatre rapports. → table « Frictions » de `results.md`.

---

## 7. Clôture

- [ ] 7.1 Studio : réactiver `baseline` (les deux ordres SQL avec `'baseline'`).
- [ ] 7.2 Terminal : `pnpm bench:seed` (remet descriptions, instructions, identité, supprime les probes créées à la main).
- [ ] 7.3 Optionnel : nettoyer le journal d'un host avec Q7 (`protocol.md` §7) avant une prochaine campagne.
- [ ] 7.4 Je passe E01-S05 : `results.md` → mcp-patterns.md §2.1, §3, §7, §8, §10, CLAUDE.md règle MCP 6, template ; puis `/commit-push`.

## Budget indicatif

| Bloc | Durée |
|------|-------|
| 1 Desktop / Cowork | 20 min |
| 2 M3, M4, M6 | 30 min |
| 3 Grille C (7 scénarios) | 1 h 45 |
| 4 Grille D (7 leviers × 4 hosts) | 2 h 30 (réductible : 3 leviers × 4 hosts = 1 h) |
| 5 Modèles | 30 min |
| 6 Frictions | 20 min |

Ordre conseillé si le temps manque : 1 → 2 → 4 (`baseline`, `readme_ack`, `readme_instructions`) → 3 (`desc_len_8k`, `many_tools_200`, `name_len_128`) → 6 → 5.
