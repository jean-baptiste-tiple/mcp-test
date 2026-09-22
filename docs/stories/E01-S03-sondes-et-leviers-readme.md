# Story E01-S03 — Sondes whoami, mutate, readme et leviers readme

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E01 — Banc MCP stateless |
| **Parcours** | 4.1 Piloter, 4.2 Observer, 4.3 Faire lire le readme |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, security, typescript, testing |
| **Estimation** | M |

## Contexte

S02 sert des tools echo depuis la base. Cette story ajoute les trois sondes qui rendent le banc utilisable depuis un host (whoami pour comparer, mutate pour changer sans quitter la conversation, readme pour tester la lecture forcée) et les six leviers readme, appliqués par une fonction pure sur le snapshot. L'ack est sans état (HMAC fenêtré) ; le gate s'appuie sur le journal.

**Refs :**
- PRD : FR-PILOT-03, FR-PILOT-05, FR-OBS-02, FR-README-01..05, NFR-README-01
- Architecture : section 6 (tools, leviers, ack), section 7 (plafonds) ; ADR-001 (list_changed best effort), ADR-002

## Critères d'acceptation

- [ ] **Given** un scénario actif **When** `bench_whoami` est appelé **Then** le texte contient le slug, `server_version`, la liste `name@version` des tools activés, le user-agent, la version de protocole et le session id (ou `none`), le sha256 court des instructions et du readme ; `structuredContent` porte les mêmes champs
- [ ] **Given** le scénario actif **When** `bench_mutate {action: "create_tool", name, description, input_schema?}` **Then** une ligne activée est créée (`handler = echo`), `server_version` passe de `1.0.N` à `1.0.N+1`, le texte de résultat dit quoi faire ensuite (« Now call bench_whoami and compare with your tool list »)
- [ ] **Given** un tool existant **When** `update_tool` avec description ou schéma **Then** ligne mise à jour, `version` incrémentée ; `disable_tool` et `enable_tool` basculent `enabled` ; `set_instructions` remplace les instructions du scénario ; `bump_version` incrémente seule la version serveur
- [ ] **Given** des arguments invalides (nom hors `^[a-zA-Z0-9_.-]{1,255}$`, description > 100 ko, action inconnue) **When** `bench_mutate` **Then** `isError` avec le champ fautif et la règle
- [ ] **Given** `bench_mutate` en stateless **When** il tente `sendToolListChanged()` **Then** aucune erreur n'atteint l'agent et l'événement porte `list_changed_sent = false` (ou `true` si l'envoi a réussi)
- [ ] **Given** un scénario avec `readme_content` **When** `bench_readme` **Then** le texte contient le contenu puis `ack: <12 caractères>` ; deux appels dans la même fenêtre donnent le même ack ; un `readme_content` différent donne un ack différent
- [ ] **Given** levier `ack` **When** `tools/list` **Then** chaque tool non-readme a `ack` dans `properties` et `required`, décrit « Value returned by bench_readme; call it first » ; **When** `bench_echo` sans ack ou avec un ack faux **Then** `isError` « Call bench_readme first and pass its ack » ; avec un ack valide **Then** résultat normal ; avec TTL 60 s et un ack de la fenêtre n-2 **Then** rejet mentionnant l'expiration
- [ ] **Given** levier `gate` et aucun événement `tools/call bench_readme` pour l'empreinte (user_agent, ip) dans la fenêtre **When** `bench_echo` **Then** rejet « Call bench_readme first » ; avec un événement readme récent **Then** résultat normal
- [ ] **Given** levier `instructions` **Then** instructions préfixées par la consigne exacte d'architecture §6 ; `descriptions` **Then** chaque description non-readme préfixée ; `name_first` **Then** readme nommé `bench_00_readme` en première position et appelable sous ce nom ; `hub` **Then** descriptions non-readme réduites à « <name>: see bench_readme for usage. » ; `none` **Then** aucune transformation
- [ ] **Given** `BENCH_ACK_SECRET` absent et `NODE_ENV = production` **When** `bench_readme` ou une vérification d'ack s'exécute **Then** erreur explicite « BENCH_ACK_SECRET missing » ; en développement, secret de repli `dev-secret` avec avertissement console

## Implémentation

### Fichiers à créer
- `src/mcp/bench/handlers/whoami.ts`
- `src/mcp/bench/handlers/mutate.ts` : valide avec `BenchMutateInput`, écrit via `repo`, bump versions, tente `ctx.server.sendToolListChanged()` dans un try/catch, renvoie texte + structuredContent + `next_actions: ["bench_whoami"]`
- `src/mcp/bench/handlers/readme.ts`
- `src/mcp/bench/levers.ts` : `applyLever(snapshot): { tools: Tool[]; instructions: string }` pure ; `requiresAck(lever)`, `requiresGate(lever)`
- `src/mcp/bench/ack.ts` : `makeAck({secret, scenarioId, readmeContent, ttlSeconds, now})`, `verifyAck(...)` (fenêtre courante ou précédente), `getAckSecret()`
- `src/lib/schemas/bench-mutate.ts` : Zod, `.describe()` sur chaque champ, `action` enum, plafonds
- `tests/unit/bench-levers.test.ts`, `tests/unit/bench-ack.test.ts`, `tests/unit/bench-handlers.test.ts`

### Fichiers à modifier
- `src/mcp/bench/repository.ts` : `createTool`, `updateTool`, `setToolEnabled`, `setInstructions`, `bumpServerVersion`, `hasRecentReadmeCall(fingerprint, sinceTs)` ; implémentations Supabase et mémoire. Chaque `update` pose `updated_at = now()` explicitement (aucun trigger en base : la colonne n'est maintenue que par le code)
- `src/mcp/bench/registry.ts` : enregistrement des 3 handlers ; vérification ack ou gate avant dispatch pour les tools non-readme ; `applyLever` utilisé par `tools/list`. S02 a livré `installBenchHandlers(server, snapshot)` et `dispatchToolCall(snapshot, name, args)` sans `ctx` (surface morte à l'époque) : S03 introduit `ctx` ici, avec `server` (pour `sendToolListChanged`), `headers` et `fingerprint` (user_agent, ip)
- `src/mcp/server.ts` : instructions servies après `applyLever`
- `src/app/api/[transport]/route.ts` : GET et DELETE journalisés comme `method = 'http:GET'` / `'http:DELETE'` (sans body, avec en-têtes et empreinte) puis 405 direct sans charger le snapshot : « ce host a tenté d'ouvrir le flux SSE » est une mesure du banc (E02)
- `src/mcp/bench/events.ts` : champ `list_changed_sent` ; support des événements sans body JSON-RPC
- `supabase/migrations/<timestamp>_probes.sql` : ajoute au scénario `baseline` les lignes `bench_whoami`, `bench_mutate`, `bench_readme` (handlers), descriptions « Use this when… / Do not use for… », annotations honnêtes (`readOnlyHint: true` sauf mutate, `destructiveHint: false`, `idempotentHint` sur whoami/readme), `readme_content` de base avec une consigne « quote the ack line back to the user ». **Cette migration est la source unique des 4 sondes** : le seed de S04 les clone depuis `baseline` vers les autres scénarios, il ne les redéfinit pas
- `.env.example` : `BENCH_ACK_SECRET`
- `scripts/smoke-mcp.mjs` : appelle `bench_whoami` après `tools/list`

### Patterns à suivre
- `.claude/conventions/mcp-patterns.md` §3 (descriptions, annotations, `.describe()`), §4 (deux formes, erreurs actionnables, `next_actions`), §6 bis (secrets : échouer bruyamment en prod)
- `.claude/conventions/security-patterns.md`

## Tests attendus

### Unit tests
- [ ] `bench-ack.test.ts` : déterminisme dans la fenêtre, changement avec le contenu, fenêtre précédente acceptée, n-2 refusée, TTL nul = fenêtre 0, secret manquant en prod
- [ ] `bench-levers.test.ts` : un test par levier sur un snapshot fixture (tools, instructions, ordre, `required`), `none` = identité
- [ ] `bench-handlers.test.ts` : whoami (contenu texte et structuré) ; mutate : chaque action, validation Zod, bump versions, `list_changed_sent` ; readme : contenu + ack ; gate via `MemoryBenchRepository.hasRecentReadmeCall`
- [ ] `mcp-server.test.ts` : scénario `readme_ack` de bout en bout via `InMemoryTransport` : readme → ack → echo OK ; echo sans ack → isError

### Integration tests
- [ ] Aucun

### E2E tests
- [ ] N/A

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
