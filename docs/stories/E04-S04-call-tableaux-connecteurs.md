# Story E04-S04 — call : catalogue, tableaux, connecteurs simulés, droits, confirmation, sondes

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Maquette de la plateforme MCP d'entreprise |
| **Parcours** | 4.5 Éprouver la maquette de la plateforme |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, database, supabase, security, tables, testing |
| **Estimation** | L |

## Contexte

Tout ce qui agit passe par `call` : tableaux, connecteurs, sondes. Le serveur garde la main : la fonction existe, l'équipe y a droit, les arguments sont valides, une fonction sensible attend l'accord de l'utilisateur. Les connecteurs sont simulés et déterministes : aucun réseau.

**Refs :**
- PRD : FR-PROTO-09, 10, 11, 13
- Architecture : §9.4 (droits, confirmation), §9.6 (plafonds)
- Doc fonctionnel : « Tableaux », « Connecteurs », « Observabilité et sécurité »

## Critères d'acceptation

- [ ] **Given** le catalogue `functions/registry.ts` **Then** 13 fonctions : `table.rows`, `table.aggregate`, `table.write`, `table.claim`, `table.release`, `table.schema`, `sellsy.list_estimates`, `sellsy.get_estimate`, `mail.create_draft`, `mail.send_draft` (sensitive), `slack.post_message`, `probe.payload`, `probe.echo` ; chacune : connecteur, classe (read, write, sensitive), description en anglais (première phrase = ce qu'elle fait), schéma Zod, au moins un exemple, refus possibles
- [ ] **Given** une fonction inconnue **Then** `isError` « Unknown function X. Use acme_find with type function. »
- [ ] **Given** des arguments invalides **Then** `isError` qui liste chaque problème (chemin, attendu) et renvoie à `acme_read {path: "<fonction>"}` pour le contrat
- [ ] **Given** `paul` (Support) et `sellsy.list_estimates` **Then** (preuve 7) refus « sellsy is open to team Ventes (lead: Claire …). Ask them for access. » ; la fonction ne s'exécute pas
- [ ] **Given** `mail.send_draft {id}` sans `confirm` **Then** (preuve 7) rien n'est envoyé ; récapitulatif nominatif (destinataire, objet, début du corps) et « Show this to the user and ask for explicit approval, then call again with confirm: true. » ; avec `confirm: true` **Then** brouillon `sent`, `sent_at` posé
- [ ] **Given** `sellsy.list_estimates {status?, older_than_days?}` **Then** des devis fictifs déterministes (dates relatives à aujourd'hui, montants HT, contacts sur un domaine `.test`) ; `sellsy.get_estimate {id}` **Then** le détail, id inconnu **Then** refus avec les ids existants
- [ ] **Given** `mail.create_draft {to, subject, body}` **Then** ligne `mail_drafts` et id `dr_…` ; `slack.post_message {channel, text}` **Then** accusé simulé déterministe, rien d'envoyé
- [ ] **Given** `table.schema {table}` **Then** colonnes typées, clé, colonne d'état et ses états, cycle de vie
- [ ] **Given** `table.rows {table, filter?, columns?, limit? (≤ 50), cursor?}` **Then** lignes demandées, total, curseur suivant ; jamais plus de 50
- [ ] **Given** `table.aggregate {table, group_by}` **Then** comptes par valeur
- [ ] **Given** `table.write {table, rows: [{key, revision?, set?, clear?, verified_empty?}]}` **Then** par ligne : ce qui a changé, ce qui est refusé et pourquoi ; `null` dans `set` refusé (preuve 6) avec « null is refused: use clear to empty a field, or verified_empty with a reason for 'searched, nothing found' » ; colonne inconnue, type faux, état hors liste refusés ; `revision` périmée refusée avec la ligne actuelle ; provenance posée par cellule ; champ non nommé intact
- [ ] **Given** `table.claim {table, worker, limit? (≤ 5), lease_minutes? (≤ 60)}` **Then** lignes `à traiter` non réservées passées `en cours` avec `claimed_by` et `lease_until` ; deux claims successifs ne rendent jamais la même ligne ; `table.release {table, key, worker, state?}` libère, refus si un autre travailleur tient la ligne
- [ ] **Given** `probe.payload {chars (≤ 200 000)}` **Then** un texte de `chars` caractères exactement, avec un canari `[C:proto:<position>]` tous les 1 000 caractères ; `probe.echo {text}` **Then** longueur reçue, premiers et derniers 40 caractères, canaris trouvés
- [ ] **Given** un appel > 1 Mo d'arguments **Then** refus actionnable
- [ ] **Given** tout appel **Then** le journal porte `target` = nom de la fonction, l'équipe sous laquelle il a couru, `args_chars` ; `structuredContent.text === content[0].text` (preuve 5)

## Implémentation

### Fichiers à créer
- `src/proto/functions/registry.ts`, `table.ts`, `simulated.ts`
- `src/proto/services/call.ts`
- `tests/integration/proto-call.test.ts`

### Fichiers à modifier
- `src/proto/mcp/server.ts` : `call` branché
- `src/proto/services/read.ts` (si S03 livrée) : contrat servi depuis le catalogue ; sinon S03 le branche

### Patterns à suivre
- `mcp-patterns.md` §3 (destructif en deux temps, jamais dans une suite proposée), §4 (erreurs actionnables)
- `security-patterns.md` (entrées non fiables, plafonds)
- `tables-patterns` n'existe pas en MCP : suivre le doc fonctionnel « Tableaux »

## Tests attendus

### Unit tests
- [ ] Validation des `table.write` (set, clear, verified_empty, null, types) en fonction pure

### Integration tests
- [ ] `proto-call.test.ts` : preuves 6 (null) et 7 (sensible, hors droits), claim concurrent, curseur, sondes, preuve 5

### E2E tests
- [ ] N/A

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Option plus simple écartée

### Notes
