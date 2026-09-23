# Protocole du banc MCP

> Runbook concret de la campagne en cours (clics, prompts, ordre, budget) : `docs/bench/campagne.md`.
> Ce document se suit à la main, host par host. Chaque étape donne le prompt exact, ce qu'on attend, et où lire l'observation (dans le host, ou en SQL dans `bench_events`). Les résultats vont dans `docs/bench/results.md`, toujours avec la date et le `client_name@client_version` loggé.
> Hosts : Claude Code (CC), Claude Desktop / Cowork (CD), claude.ai web (CW), ChatGPT developer mode (GPT). MCP Inspector (INS) sert de référence : il montre exactement ce que le serveur sert.

## 0. Pré-requis

1. Base seedée : `pnpm bench:seed` (catalogue complet). Scénario actif = `baseline` (Studio : table `bench_scenarios`, colonne `is_active`).
2. URL du serveur : `https://mcp-test-navy.vercel.app/api/mcp`. Vérifier avec `pnpm mcp:smoke https://mcp-test-navy.vercel.app/api/mcp`.
3. Éditeur SQL Supabase ouvert sur le projet (requêtes de la section 7).
4. Connexion de chaque host (les interfaces changent ; adapter) :
   - CC : `claude mcp add --transport http bench https://mcp-test-navy.vercel.app/api/mcp` puis `/mcp` pour l'état et le reconnect.
   - CD et CW : Paramètres → Connecteurs → Ajouter un connecteur personnalisé → URL. Activer le connecteur dans la conversation.
   - GPT : Paramètres → Connecteurs → Mode développeur → Créer → URL, sans auth. Activer dans la conversation.
   - INS : `pnpm mcp:inspect`, transport Streamable HTTP, même URL.
5. Noter l'heure exacte de chaque geste humain (ajout du connecteur, ouverture d'une conversation, envoi d'un message, reconnect). C'est la référence pour lire le journal.
6. **Noter le modèle** sélectionné dans le host (Claude : Sonnet, Opus, Fable ; ChatGPT : modèle du sélecteur). Le serveur ne voit que le host, jamais le modèle : chaque session est taguée par le `note` de P0 (section 1). Ce qui dépend du host se mesure une fois par host (grilles A, B, C : moments de lecture, propagation, troncature par le host) et se contrôle sur un second modèle ; ce qui dépend du modèle se mesure par modèle (grille D leviers readme, citation des canaris, golden queries, rapport de frictions).

## 1. Empreinte du host et tag de session

Deux préalables mesurés le 2026-09-22 : sur claude.ai, le premier message d'une conversation part **au moins 12 s après le chargement de la page** (sinon la conversation reçoit les définitions d'un instantané local du navigateur, parfois vieux d'une heure) ; sur ChatGPT, le connecteur est **sélectionné par `@nom`** dans le composeur pour toute question qui ne demande pas d'agir (sinon ses tools ne sont pas chargés).

Contrôle du canal lu par le modèle (**P16**) : « Call bench_echo with message "raw-check". Then paste the tool result exactly as you received it, verbatim and character for character, inside a code block. » → `{"message":"raw-check"}` = le modèle lit le `content` texte ; `{"args":{"message":"raw-check"}}` = il lit `structuredContent`.

Prompt **P0** dans chaque nouvelle conversation de test (remplacer host et modèle) :

> Call bench_whoami with note "claude-code/opus" and paste its full output verbatim.

Attendu : le texte du tool (scénario, version, user-agent, protocole, liste `name@version`, `note`). Lire ensuite **Q1** : relever `client_name`, `client_version`, `user_agent`, `ip`. Reporter dans l'en-tête de `results.md` avec le modèle. Cette empreinte filtre toutes les requêtes suivantes ; **Q8** liste les tags de session et leur heure, ce qui borne chaque conversation dans le journal.

## 2. Moments de lecture (grille A)

Objectif : savoir quand le host envoie `initialize` et `tools/list`.

Séquence, en notant l'heure de chaque geste :
1. Ajouter le connecteur (ou démarrer CC) → **Q2** : y a-t-il `initialize` et `tools/list` dans la minute ?
2. Ouvrir une nouvelle conversation sans rien envoyer → Q2.
3. Envoyer un message sans rapport avec le serveur (« Bonjour ») → Q2.
4. Envoyer P0 → Q2 : `tools/list` avant le `tools/call` ?
5. Envoyer un second message qui appelle un tool → Q2 : nouveau `tools/list` ?
6. Reconnect (CC : `/mcp` reconnect ; CD/CW/GPT : désactiver puis réactiver le connecteur) → Q2.

Remplir la grille A : pour chaque geste, `initialize` oui/non, `tools/list` oui/non.

## 3. Propagation d'une mise à jour (grille B)

Six mutations. Pour chacune, même conversation que P0 sauf indication, puis monter l'échelle.

**Mutations**

| # | Mutation | Comment l'appliquer | Prompt de vérification |
|---|----------|---------------------|------------------------|
| M1 | Tool créé | P1 : `bench_mutate` `create_tool` | P2 |
| M2 | Description modifiée | P1 : `update_tool` avec une description contenant un nouveau canari | P3 |
| M3 | Schéma modifié | P1 : `update_tool` sur `bench_echo` : `message` requis + `mode` enum `[fast, slow]` | P4 |
| M4 | Tool désactivé | P1 : `disable_tool` sur le tool de M1 | P2 puis P5 |
| M5 | Instructions modifiées | P1 : `set_instructions` avec un nouveau canari | P6 |
| M6 | Identité serveur | Studio : `server_name`, `server_title` ; P1 : `bump_version` | P7 |

**Prompts**

- **P1** (exemple M1) : « Call bench_mutate with action "create_tool", name "bench_probe_1", description "Probe tool [C:manual:desc:end:0001]. Use this when asked to probe." Then stop. »
- **P2** : « List the exact names of every tool you currently have from the bench server. Do not call any tool. »
- **P3** : « Which bracketed codes of the form [C:...] appear in the descriptions of the bench tools you can see? List them with the tool name. » (forme canonique : ChatGPT refuse « quote verbatim the description », jugé « internal »). Variante complète quand le host coopère : « Quote verbatim the description of tool bench_probe_1 as you see it. Do not call any bench tool. » Sur Claude Code, ajouter : « You may load the tool definition with ToolSearch first. » (les tools MCP y sont différés : sans chargement, le modèle ne voit que le nom ; le chargement n'est pas un appel MCP, le serveur n'en voit rien). Sur claude.ai, l'index différé ne montre que ~80 caractères par description : un canari `end` au-delà n'est visible qu'après chargement par `tool_search`.
- **P4** : « Call bench_echo with message "hello". » → lire les `args` dans **Q2** (le host envoie-t-il `mode` ? refuse-t-il sans `message` ?).
- **P5** : « Call bench_probe_1. » → le host refuse (tool inconnu côté host) ou appelle et reçoit l'erreur serveur « Unknown tool ».
- **P6** : « Quote verbatim the instructions of the bench server, including any bracketed codes. Do not call any tool. »
- **P7** : « What are the name, title and version of the bench MCP server as you see them? Do not call any tool. »

**Échelle d'actions** (s'arrêter au premier niveau où le host voit le changement)

| Niveau | Action |
|--------|--------|
| L0 | Rien : prompt de vérification dans la même conversation |
| L1 | Un message de plus dans la même conversation |
| L2 | Nouvelle conversation |
| L3 | Reconnect (CC `/mcp` ; connecteur désactivé puis réactivé) |
| L4 | Supprimer puis réajouter le connecteur |
| L5 | Redémarrer l'application |

À chaque niveau, deux lectures : ce que le host **rapporte** (prompt) et ce que le serveur **a servi** (**Q3** : un `tools/list` après l'heure de la mutation ?). Les deux peuvent diverger : « fetché mais ignoré » est un résultat en soi. Case de la grille B = niveau minimal, plus `fetch: oui/non`, date, client.

Notification dans le flux : chaque appel `bench_mutate` écrit `notifications/tools/list_changed` dans le flux de réponse de son propre `tools/call` (seule voie stateless, ADR-001), et l'événement porte `list_changed_sent = true`. Regarder d'abord **Q3** juste après P1 : un `tools/list` dans les secondes qui suivent, sans geste humain, signifie que le host honore la notification (niveau L0 par notification). Son absence est la mesure attendue pour la plupart des hosts et prépare E02.

Remettre `baseline` d'aplomb après chaque host : `pnpm bench:seed` restaure `baseline` et tous les scénarios depuis `scripts/lib/probes.mjs` et le catalogue (sondes, descriptions, schémas, instructions, readme, `server_version`) et supprime `bench_probe_1` ; il ne touche jamais `is_active`. Le journal `bench_events` n'est pas modifié.

## 4. Limites de taille et de nombre (grille C)

Pour chaque scénario de limite : activer dans Studio, puis **L4** (supprimer et réajouter le connecteur) pour éliminer tout cache, nouvelle conversation, puis le prompt.

| Scénarios | Prompt | Ce qu'on lit |
|-----------|--------|--------------|
| `desc_len_500`, `_2k`, `_8k`, `_32k` | **P8** : « For each tool of the bench server, quote every bracketed code of the form [C:...] that appears in its description, in order. Do not call any bench tool. » Sur Claude Code, ajouter « You may load the tool definitions with ToolSearch first. » | Canari `end` absent = troncature entre `middle` et `end` ; `middle` absent = troncature plus tôt ; aucun = description non exposée. Sur Claude Code, distinguer « non chargé » (nom seul) de « tronqué » |
| `instr_len_0`, `_500`, `_5k`, `_20k`, `_50k` | **P6** | Idem sur les instructions ; `instr_len_0` mesure si le host dit quelque chose sans instructions |
| `name_len_32`, `_64`, `_128`, `name_chars` | **P9** : « List the exact tool names of the bench server, then call the one whose name is the longest with message "x". » | Nom tronqué, renommé, refusé ; appel réussi ou non (Q2 : `tool_name` reçu) |
| `many_tools_20`, `_50`, `_100`, `_200`, `_500` | **P10** : « How many tools does the bench server expose? Give the first five and the last five names. Are any of them deferred or hidden from you? » | Nombre rapporté vs `tools_served` (**Q4**) ; CC : mention de ToolSearch / outils différés ; refus du host au chargement |
| `schema_shape` | **P11** : « Describe the input schema of bench_shape_deep as you see it, then call it with a valid example. » | Schéma exposé entier ou simplifié ; `args` envoyés (Q2) |
| `server_identity` | **P7** | Où apparaissent name, title, version (préfixe des tools en CC, libellé UI, réponse du modèle) |

Coût : **Q4** donne `response_chars` par scénario ; tokens ≈ chars / 4. Noter le seuil où le host change de comportement.

## 5. Leviers readme (grille D)

Dépend du modèle : répéter par modèle disponible dans le host (Claude : Sonnet, Opus, Fable ; ChatGPT : au moins le modèle par défaut et un modèle de raisonnement). Pour chaque scénario `readme_instructions`, `readme_descriptions`, `readme_name_first`, `readme_gate`, `readme_ack`, `readme_hub` (et `baseline` comme témoin) : activer, **L4**, puis :

1. Nouvelle conversation, **P0** avec le tag du modèle, puis prompt **P12** (ne mentionne jamais le readme) : « Use the bench server to echo the message "hello". »
2. Même conversation, **P13** : « Now echo "again". »
3. Nouvelle conversation, P12 encore.
4. Pour `readme_ack` et `readme_gate` : relever les erreurs (**Q6**) et le nombre d'essais avant succès.

Lecture : **Q5** donne, par conversation reconstituée (trou de 30 min), le premier tool appelé et le nombre d'appels readme. Remplir la grille D : readme appelé au premier usage (oui/non), à chaque message (oui/non), en nouvelle conversation (oui/non), nombre d'erreurs, coût = longueur du readme × appels.

Prompt de contrôle **P14** après chaque levier : « Did you read a readme or usage note before using the bench server? Quote the bracketed codes you saw in it. » → distingue « a appelé » de « a lu ».

## 6. Rapport de frictions (mcp-patterns §8)

En fin de campagne sur chaque host, prompt **P15** :

> Write a structured friction report about the bench MCP server: step by step what you did, where you hesitated or failed, what you think caused it, and a minimal reproduction for each issue. Mention anything about tool descriptions, instructions or the readme that was unclear, truncated or missing.

Coller la synthèse dans `results.md`, section « Frictions ».

## 7. Requêtes SQL

Remplacer `$UA` et `$IP` par les valeurs de Q1.

**Q1. Empreintes**
```sql
select client_name, client_version, user_agent, ip,
       min(ts) as first_seen, max(ts) as last_seen, count(*) as events
from bench_events
group by 1, 2, 3, 4
order by last_seen desc;
```

**Q2. Chronologie d'une empreinte (2 dernières heures)**
```sql
select ts, method, tool_name, args, tools_served, response_chars, is_error, error_text
from bench_events
where user_agent = $UA and ip = $IP and ts > now() - interval '2 hours'
order by ts;
```

**Q3. tools/list après une mutation**
```sql
select ts, scenario_slug, server_version, tools_served, response_chars
from bench_events
where method = 'tools/list' and user_agent = $UA and ip = $IP and ts > '<heure de la mutation>'
order by ts;
```

**Q4. Taille servie par scénario**
```sql
select scenario_slug, max(tools_served) as tools, max(response_chars) as chars,
       round(max(response_chars) / 4.0) as approx_tokens
from bench_events
where method = 'tools/list'
group by 1
order by 1;
```

**Q5. Readme avant le premier autre tool, par conversation reconstituée**
```sql
with calls as (
  select ts, user_agent, ip, tool_name, is_error,
         lag(ts) over (partition by user_agent, ip order by ts) as prev_ts
  from bench_events
  where method = 'tools/call'
), marked as (
  select *, case when prev_ts is null or ts - prev_ts > interval '30 minutes' then 1 else 0 end as new_conv
  from calls
), conv as (
  select *, sum(new_conv) over (partition by user_agent, ip order by ts) as conv_id
  from marked
)
select user_agent, ip, conv_id, min(ts) as started,
       (array_agg(tool_name order by ts))[1] as first_tool,
       count(*) filter (where tool_name in ('bench_readme', 'bench_00_readme')) as readme_calls,
       count(*) filter (where is_error) as errors,
       count(*) as calls
from conv
group by 1, 2, 3
order by started desc;
```
Le trou de 30 minutes approxime une conversation en stateless ; avec E02, `session_id` le remplace.

**Q6. Erreurs récentes**
```sql
select ts, user_agent, tool_name, error_text
from bench_events
where is_error
order by ts desc
limit 50;
```

**Q7. Remise à zéro du journal d'un host (avant une nouvelle campagne)**
```sql
delete from bench_events where user_agent = $UA and ip = $IP;
```

**Q8. Tags de session (host/modèle) et bornes des conversations**
```sql
select ts, user_agent, ip, args->>'note' as session_tag
from bench_events
where method = 'tools/call' and tool_name = 'bench_whoami' and args ? 'note'
order by ts desc;
```
Chaque ligne ouvre une conversation de test ; les événements de la même empreinte entre deux tags appartiennent à la conversation du premier. Pour Q5, filtrer sur l'intervalle du tag voulu au lieu du trou de 30 minutes quand les conversations s'enchaînent vite.

## 8. Serveur proto (E04)

Maquette de la plateforme d'entreprise : `https://mcp-test-navy.vercel.app/api/proto/u/<utilisateur>/mcp` (architecture §9, ADR-003). Grille et résultats : `docs/bench/results-proto.md`. Prompts : `docs/proto-golden-queries.md`.

### 8.1 Pré-requis

1. `pnpm proto:seed` avant une campagne : remet Acme et Delta à zéro (journal, ctx, brouillons compris). Jamais pendant.
   Entre deux hosts (ou deux modèles), sans perdre le journal : `pnpm proto:set acme prospects reset` remet le tableau `ventes/suivi_prospects` dans l'état du seed (D4 consomme la file « à traiter », D5 en agrège les chiffres).
2. Deux connecteurs par host, branchés ensemble : **Acme** `…/api/proto/u/jb/mcp` et **Delta** `…/api/proto/u/jb-delta/mcp`. Noms de connecteur : « Acme » et « Delta ».
   - Claude Code : fichier `--mcp-config` avec deux serveurs HTTP `acme` et `delta`, `--strict-mcp-config`, session neuve par prompt (`claude -p`), deuxième tour par `--resume <session_id>`.
   - claude.ai : Paramètres → Connecteurs → Ajouter un connecteur personnalisé (fait avec JB). Premier message au moins 12 s après le chargement de la page.
   - ChatGPT : Paramètres → Connecteurs → Mode développeur → Créer, sans auth (fait avec JB). Sélection par `@Acme` ou `@Delta`.
3. Aucun prompt ne nomme un connecteur (sauf `@` sur ChatGPT). Le serveur ne voit pas le modèle : noter l'heure de début de chaque conversation et le modèle.

### 8.2 Requêtes SQL (`proto.journal`)

Remplacer `$T` par l'heure de début (UTC) de la conversation.

**R1. Empreintes des hosts**
```sql
select j.client_name, j.user_agent, u.slug, min(j.ts) as first_seen, max(j.ts) as last_seen, count(*) as initializes
from proto.journal j join proto.users u on u.id = j.user_id
where j.method = 'initialize'
group by 1, 2, 3 order by last_seen desc;
```

**R2. Chronologie d'une conversation**
```sql
select to_char(j.ts, 'HH24:MI:SS') as t, u.slug, j.method, j.tool, j.target, j.ctx,
       j.args->'arguments' as arguments, j.args->>'confirm' as confirm,
       j.args_chars, j.result_chars, j.is_error, j.error, j.duration_ms
from proto.journal j join proto.users u on u.id = j.user_id
where j.ts > '$T' and j.method in ('tools/call', 'prompts/list', 'prompts/get')
order by j.ts, j.id;
```
Premier appel de la conversation = première ligne ; « deux appels avant la première action » = nombre de lignes avant le premier `call` d'une fonction de classe write ou sensitive.

**R3. Confirmations (preuve 10)**
```sql
select to_char(ts, 'HH24:MI:SS') as t, ctx, args->'arguments'->>'id' as draft, args->>'confirm' as confirm, is_error, left(error, 80)
from proto.journal where target = 'mail.send_draft' and ts > '$T' order by ts;
```

**R4. Tailles (mesures 3 et 4)**
```sql
select to_char(ts, 'HH24:MI:SS') as t, target, args->'arguments'->>'chars' as asked, args_chars, result_chars, is_error
from proto.journal where target in ('probe.payload', 'probe.echo') and ts > '$T' order by ts;
```

**R5. Latence de context**
```sql
select count(*), percentile_cont(0.5) within group (order by duration_ms) as p50_ms, max(duration_ms)
from proto.journal where tool like '%\_context' and ts > '$T';
```

**R6. Retours des assistants**
```sql
select f.id, f.type, f.text, f.created_at from proto.feedback f where f.created_at > '$T' order by f.id;
```

### 8.3 Les sept mesures du doc fonctionnel

| # | Mesure | Bascule | Prompt | Lecture |
|---|--------|---------|--------|---------|
| 1 | Phrase dans les préférences | claude.ai : Paramètres → Profil → préférences ; ChatGPT : instructions personnalisées ; Claude Code : `--append-system-prompt`. Texte : « Quand une demande concerne mon travail (clients, devis, prospection, support, reporting), commence par le connecteur « Acme » : appelle son outil de contexte, puis suis la procédure qu'il renvoie. Si aucune procédure ne correspond, dis-le au lieu de deviner. » | D1, I2, avec puis sans la phrase | R2 : premier appel `acme_context` ? |
| 2 | Prompts suggérés | capacité `prompts` (toujours active) | ouvrir le menu du host, choisir « Relancer les devis en attente » | où les prompts s'affichent, champs visibles ; R1/R2 : `prompts/list`, `prompts/get`, puis enchaînement |
| 3 | Taille max d'un résultat lu en entier | aucune | « Appelle la fonction probe.payload avec chars = N, puis donne-moi le dernier code [C:proto:…] que tu vois. » N = 10 000, 25 000, 50 000, 100 000, 200 000 | dernier canari cité vs N ; troncature annoncée par le host ; R4 |
| 4 | Taille max d'arguments | aucune | « Écris un texte d'environ N caractères (répète le paragraphe de la méthode d'étude) et passe-le à probe.echo. » N = 2 000, 8 000, 20 000, 50 000 | R4 `args_chars` reçus |
| 5 | Expiration du ctx en pleine conversation | `pnpm proto:set acme rules bump` entre deux tours | tour 1 : D3 ; tour 2 : « Et le devis de la salle des sports ? » | R2 : erreur « context has changed » puis `acme_context` rappelé seul ? en combien d'appels ? |
| 6 | Domaines dans la description de context | `pnpm proto:set acme domains null`, puis retour à la valeur du seed : `pnpm proto:set acme domains "sales, customer support, energy consulting"` ; geste de rafraîchissement du host entre les deux | I1 avec les autres connecteurs de JB actifs | R2 : quel connecteur est appelé en premier |
| 7 | Ton servi par context | valeur du seed : `pnpm proto:set jb ton "Tutoiement, phrases courtes. Termine chaque réponse finale par la signature « — ton assistant Acme »."` | D3, I3 | la réponse finale tutoie-t-elle et porte-t-elle la signature ? |

Rapport de frictions en fin de run sur chaque host (P15 adapté) : « Write a structured friction report about the Acme and Delta connectors: step by step what you did, where you hesitated or failed, what you think caused it, and a minimal reproduction for each issue. Mention anything about tool descriptions, the context result or the ctx code that was unclear, truncated or missing. » Recouper chaque fait avec R2.
