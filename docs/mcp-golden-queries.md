# Golden Queries — éval AX du canal MCP

> Jeu de prompts anti-régression du routage des tools. Règles d'usage : `.claude/conventions/mcp-patterns.md` §8.
> À rejouer sur les quatre hosts (Claude Code, Claude Desktop, claude.ai, ChatGPT developer mode) à chaque évolution des sondes ou de leurs descriptions. Un champ de métadonnée corrigé à la fois ; noter chaque révision dans le journal en bas.
> Scénario actif pendant l'éval : `baseline`.

## Directs (nomment l'action — doivent router, dans l'ordre)

| # | Prompt | Attendu |
|---|--------|---------|
| D1 | Call bench_whoami and show me the output. | `bench_whoami` |
| D2 | Use bench_echo to echo "hello". | `bench_echo` avec `message: "hello"` |
| D3 | Create a tool named bench_probe_1 on the bench server with description "probe". | `bench_mutate` `action: create_tool` |
| D4 | Read the bench server readme. | `bench_readme` |
| D5 | Disable the tool bench_probe_1 on the bench server, then show me what the server sees. | `bench_mutate` `disable_tool` puis `bench_whoami` |

## Indirects (décrivent le résultat — doivent quand même router)

| # | Prompt | Attendu |
|---|--------|---------|
| I1 | What does the bench server know about my client right now? | `bench_whoami` |
| I2 | Send "hello" through the bench server and show me what comes back. | `bench_echo` |
| I3 | Add a new tool to the bench server for testing purposes. | `bench_mutate` `create_tool` (le modèle choisit un nom) |
| I4 | What are the usage rules of the bench server? | `bench_readme` |

## Négatifs (ne doivent PAS déclencher nos tools)

| # | Prompt | Attendu |
|---|--------|---------|
| N1 | What time is it in Paris? | Aucun tool |
| N2 | Echo this back to me: hello. | Aucun tool (réponse directe ; `bench_echo` = sur-routage) |
| N3 | Create a file named probe.txt on my disk. | Aucun tool du bench (`bench_mutate` = sur-routage) |

## Journal des révisions de métadonnées

> Les hosts peuvent cacher instructions et descriptions : appliquer l'action minimale mesurée dans `docs/bench/results.md` (grille B) avant de rejouer, sinon on évalue l'ancienne version.

| Date | Champ modifié | Raison (quel prompt échouait) | Résultat |
|------|---------------|-------------------------------|----------|
| — | — | — | — |

## Rapports de frictions agent (mcp-patterns §8)

> Voir `docs/bench/protocol.md` §6 (prompt P15). Synthèse dans `docs/bench/results.md`, section Frictions.

| Date | Host | Friction observée | Cause | Action |
|------|------|-------------------|-------|--------|
| — | — | — | — | — |
