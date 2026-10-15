# Harnais des campagnes Claude Code

> `pnpm bench:cc` lance des runs `claude -p` à partir d'un plan, garde le flux brut de chaque run et en tire une grille. Il remplace les scripts jetables des campagnes E01, E03-S05 et E04-S06, perdus avec leur scratchpad.
> Code : `scripts/bench-cc.mjs` (commandes) et `scripts/lib/cc-harness.mjs` (logique, testée par `tests/unit/bench-cc.test.ts`). Requêtes du journal serveur : `protocol.md` §8.2 (R1–R6) et §9.4 (O1–O7).

## Prérequis

- Claude Code **2.1.280 ou plus récent** (le premier qui accepte Opus 5.5) : le lanceur vérifie `claude --version` et s'arrête sinon. `claude update` pour monter.
- `claude` connecté avec un compte qui a accès aux modèles du plan (abonnement ou clé).
- Les serveurs MCP joignables. Serveur proto : `pnpm proto:seed` avant une campagne, jamais pendant (il efface le journal).
- Node 22 ou plus, `pnpm install`.

## Les trois commandes

```bash
# 1. Config MCP : des URL seulement, aucun secret. Écrite dans .bench/ (ignoré par git).
pnpm bench:cc config --server acme=https://mcp-test-navy.vercel.app/api/proto/u/jb/mcp \
                     --server delta=https://mcp-test-navy.vercel.app/api/proto/u/jb-delta/mcp

# 2. Runs. --dry-run affiche les commandes exactes sans rien lancer ; --only et --models filtrent ;
#    --out choisit le dossier (défaut .bench/cc/<plan>-<horodatage>).
pnpm bench:cc run docs/bench/plans/e04-s06.json --dry-run
pnpm bench:cc run docs/bench/plans/e04-s06.json --only D1,I3 --models sonnet

# 3. Grille : tableau markdown à l'écran, analysis.md et analysis.csv dans le dossier des runs.
pnpm bench:cc analyze .bench/cc/e04-s06-20261015-080000 --match "ton assistant Acme"
```

Un essai rapide de bout en bout : `pnpm bench:cc run docs/bench/plans/smoke.json`, soit un prompt (I3) sur Sonnet.

## Le plan

Fichier JSON versionné dans `docs/bench/plans/`.

| Champ | Rôle |
|-------|------|
| `name` | Préfixe du dossier de sortie `.bench/cc/<name>-<horodatage>/` |
| `mcpConfig` | Chemin de la config produite par `config` |
| `goldenQueries` | Fichier de golden queries (tableaux `\| ID \| prompt \| … \|`) où lire les prompts par id |
| `models` | Identifiants complets : `claude-opus-5-5`, `claude-sonnet-5`, `claude-fable-5-1` |
| `trials` | Essais par prompt et par modèle (1 par défaut) |
| `permission` | `bypass` : aucune demande d'approbation. `allowlist` : mode manuel, seuls `allowedTools` passent |
| `allowedTools` | Mode `allowlist` seulement : `mcp__<serveur>` (tout le serveur) ou `mcp__<serveur>__<outil>` (un outil) |
| `timeoutMs` | Durée maximale d'un tour (10 min par défaut) ; au-delà, le run est tué et marqué en erreur |
| `prompts` | Liste de `{ id, turns?, extraArgs? }` ; `extraArgs` ajoute des arguments à ce prompt (par exemple `--append-system-prompt` pour la mesure 1) |

Un prompt sans `turns` est la golden query de même id. Un tour est un texte, ou `{ "text", "before" }` :
- `@D1` cite la golden query D1 ;
- `before` est une commande shell jouée depuis la racine du dépôt avant ce tour, par exemple `pnpm proto:set acme rules bump` pour la mesure 5. Un plan exécute donc des commandes : ne lancer qu'un plan relu. Si `before` échoue, le run s'arrête et passe en erreur, car le tour donnerait une mesure fausse.

Le tour 2 reprend la même session par `--resume <session_id>`, dans le même dossier vide. Si un tour échoue, les suivants ne sont pas joués : sans session, ils repartiraient à vide. Ce chemin à plusieurs tours est couvert par les tests sur un run fictif, mais n'a pas encore tourné sur un vrai serveur (le serveur proto était en panne le 2026-10-15) : vérifier le premier D1 de la prochaine campagne. Durée, jetons et coût s'y additionnent tour par tour, chaque tour étant un process `claude -p` distinct.

## Ce que contient un run

Un fichier `<prompt>__<modèle>__t<essai>.jsonl` par run, une ligne JSON par événement :
- `harness_run` : run, prompt, modèle, essai, plan, mode de permission, heure de début ;
- `harness_turn` : numéro du tour, texte envoyé, commande `before` et son code de sortie, **commande exacte** (le prompt passe par stdin), heure ;
- le flux `stream-json` du CLI, tel quel : `system/init` (version, modèle, mode, état de chaque serveur MCP), `assistant` (appels `tool_use`), `user` (`tool_result`, avec `is_error`), `result` (durée, jetons, coût, `permission_denials`, réponse finale) ;
- `harness_turn_end` : code de sortie, `timed_out` si le tour a dépassé `timeoutMs`, fin de stderr, heure.

Les heures servent à borner les requêtes du journal serveur (`$T` dans R2 à R6).

## Colonnes de l'analyse

| Colonne | Lecture |
|---------|---------|
| `servers` | État de chaque serveur à l'`init` de chaque tour (`‖` sépare les tours quand il change) ; un serveur non `connected` met le run en erreur |
| `calls`, `first_call` | Nombre d'appels d'outils, premier appel |
| `sequence` | Appels dans l'ordre, sans préfixe de serveur, avec la fonction (`call`) ou le chemin (`read`) ; `!` = `confirm: true`, `✗` = erreur d'outil, `‖` sépare les tours |
| `tool_errors` | Résultats d'outil en erreur |
| `before_first_write` | Appels avant la première écriture ou le premier envoi ; vide s'il n'y en a pas. Motif par défaut : `*_write`, `mail.create_draft`, `mail.send_draft`, `slack.post_message`, `table.write`, `table.claim`, `table.release` ; `--write <regex>` le remplace |
| `confirms` | Appels avec `confirm: true` |
| `denials` | Appels refusés faute d'autorisation (mode `allowlist`) |
| `duration_s`, `tokens_in`, `tokens_out`, `cache_read`, `cache_write`, `cost_usd` | Somme des `result` des tours |
| `final_match` | La réponse finale du dernier tour correspond à `--match <regex>` (mesure 7 : signature) |
| `error` | Run inexploitable : erreur du CLI, code de sortie non nul, tour expiré ou manquant, commande `before` en échec, aucun résultat, ou serveur non connecté |

## Rejouer la campagne E04-S06

1. `pnpm proto:seed`, puis noter l'heure (UTC).
2. `pnpm bench:cc config --server acme=…/api/proto/u/jb/mcp --server delta=…/api/proto/u/jb-delta/mcp`.
3. `pnpm bench:cc run docs/bench/plans/e04-s06.json`. Le plan porte :
   - les golden queries D1 à X3, D1 en trois tours : la demande, « Oui, envoie-les. », puis le rapport de frictions P15. P15 se joue ainsi dans une conversation qui a servi, comme le veut le protocole ;
   - les mesures 1, 2, 3, 4 et 5.

   Les totaux de D1 (durée, jetons, coût, `final_match`) comptent donc aussi P15 : pour comparer D1 à E04-S06, lire la séquence des deux premiers tours.

   D4 et D5 remettent la file des prospects à zéro avant de jouer, pour que chaque modèle parte du même état. La mesure 5 fait monter la version des règles entre ses deux tours. Compter environ 90 runs.
4. `pnpm bench:cc analyze .bench/cc/<dossier> --match "ton assistant Acme"`.
5. Recouper chaque ligne avec le journal : R2 pour la séquence, R3 pour les confirmations, R4 pour les tailles, R5 pour la latence, R6 pour les tickets.
6. Avant de rejouer avec un autre modèle ou un autre host sans perdre le journal : `pnpm proto:set acme prospects reset`.

La mesure 6 ne se joue pas en headless : seuls les serveurs du plan sont branchés.

## Variante OAuth (E03-S05)

Un serveur protégé par OAuth se connecte une fois, hors du harnais :
1. `claude mcp add --transport http acme <url>`
2. `claude mcp login acme`, qui ouvre le consentement dans le navigateur.

Le plan garde **les mêmes noms de serveurs** dans sa config. Le protocole (§9.1) l'écrit ainsi pour le headless, mais la campagne E03-S05 a en réalité appelé les serveurs en scope `local` sans `--strict-mcp-config`. La reprise des jetons par `--mcp-config` est à vérifier au premier run : la colonne `servers` doit dire `connected`.

`claude mcp login` exige un terminal (TTY), même avec `--no-browser`. En E03-S05, un pilote `node-pty` a tenu ce rôle :
1. lancer `claude mcp login <nom>` dans un pseudo-terminal ;
2. lire l'URL d'autorisation dans sa sortie ;
3. la jouer dans un navigateur piloté, déjà connecté au site avec le bon compte ;
4. attendre la fin du process.

Il n'est pas versionné. Un humain fait la même chose en lançant la commande dans son terminal.

## Pièges

Encodés dans le harnais :
- **Sans `--tools ""`**, le modèle se rabat sur ses outils internes : Fable a tenté Bash sur N1.
- **Sans `--strict-mcp-config`**, une session connectée à claude.ai charge aussi les connecteurs claude.ai de l'utilisateur, soit deux clients OAuth pour un même serveur.
- **Les réglages et instructions personnels fuient dans les runs**, mesuré le 2026-10-15 :
  - `defaultMode: "auto"` dans `~/.claude/settings.json` a fait approuver par le classifieur un outil hors allowlist, en 42 s au lieu de 7 ; hooks et plugins personnels étaient aussi chargés. `--setting-sources project` les écarte.
  - `~/.claude/CLAUDE.md` entre dans chaque run, **même avec `--setting-sources project`**. Sur un run sans outils, le modèle a passé la réponse à chercher un fichier que ce CLAUDE.md importait. Le harnais passe `--settings` avec `claudeMdExcludes` sur `**/CLAUDE.md`, `**/CLAUDE.local.md` et `**/.claude/rules/**` : interrogé, le modèle ne voit plus le CLAUDE.md personnel (témoin : oui ; avec l'exclusion : non). Le cas des règles de `~/.claude/rules/` n'est pas mesuré : le poste de mesure n'en avait pas.

  Le dossier de run étant vide, aucune instruction de projet ne s'ajoute.
- **`bypassPermissions`** supprime toute demande d'approbation. Pour mesurer qui demande quoi, utiliser `allowlist`, qui force le mode manuel, celui d'un poste neuf, affiché `default` dans l'`init`.
- **Le piège « toujours autoriser ».** `mcp__acme` dans `allowedTools` autorise tout le serveur, comme un « toujours autoriser » donné une fois pour toutes. Pour voir les approbations outil par outil, lister les outils un à un. Mesuré le 2026-10-15 : un outil absent de la liste est refusé, faute de quelqu'un pour répondre en `-p`. Le refus apparaît dans `denials` et comme résultat d'outil en erreur (« Claude requested permissions to use mcp__acme__acme_read, but you haven't granted it yet »), et le modèle demande l'autorisation à l'utilisateur.
- **CLI trop ancien.** Le lanceur s'arrête sous 2.1.280.
- **Windows.** `claude` y est un raccourci `.cmd` que Node ne lance pas sans shell, et un shell casserait les prompts accentués. Le lanceur trouve `claude.exe` dans le `PATH` ou derrière le raccourci npm, et passe le prompt par stdin.

À surveiller run par run :
- **Serveur lent.** En `-p`, Claude Code connecte les serveurs de `--mcp-config` sans bloquer le prompt. Un serveur lent laisse donc le run partir sans outils : « aucun appel », `servers` = `pending` ou `failed`. Le run est alors marqué en erreur et signalé par le lanceur. Mesuré le 2026-10-15, avec un `initialize` du serveur proto à 9–40 s. `MCP_TIMEOUT=120000` évite l'abandon à 30 s, mais pas le départ sans outils : il faut un serveur qui répond vite, puis rejouer les runs en erreur. Si `context` répond en erreur, voir les journaux du serveur, pas le harnais.
- **Interruptions du host.** Classifieur, filtre de sécurité, garde-fous sur les gros contenus : environ 3 sur 90 runs en E04-S06. Elles se lisent dans `result` et dans la réponse finale.

## Le récit du modèle n'est pas une preuve

Le flux dit ce que le CLI a envoyé et reçu. Le journal du serveur dit ce qui s'est réellement passé : R1 à R6 pour le serveur proto, O1 à O7 pour le serveur OAuth. Un fait de grille cite les deux. Le rapport de frictions P15 donne des hypothèses, à recouper appel par appel avec R2.
