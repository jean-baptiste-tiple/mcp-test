# Story E03-S06 — Campagne claude.ai et ChatGPT, restitution et verdict

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E03 — Authentification des assistants : OAuth 2.1 avec Supabase |
| **Parcours** | 4.6 Connecter un assistant par OAuth |
| **Statut** | ✅ Done (2026-09-23, coupée avant 8a/8b) |
| **Priorité** | Must |
| **Référence UI** | N/A |
| **Conventions** | mcp, testing |
| **Estimation** | L |

## Contexte

Les hosts web se pilotent par le navigateur (Playwright MCP, sessions de JB), le même que celui de la campagne E04-S07 : cette story n'ouvre le navigateur que lorsque JB confirme que l'autre session ne l'utilise plus. Ce qui touche aux comptes de JB se fait avec lui : ajout des connecteurs Acme et Delta sur claude.ai et ChatGPT, connexion sur l'hôte Acme (JB puis l'alias), réglages Supabase pour l'expiration. La story se termine par la restitution : `results-oauth.md` complet, le verdict de l'ADR-004, la liste des changements proposés à la section « Connexion et identité » du doc technique, un résumé court à JB.

**Refs :**
- PRD : FR-AUTH-11, FR-AUTH-12, critères « hosts » du parcours 4.6
- `docs/bench/protocol.md` §9, `docs/bench/results-oauth.md`, ADR-004 §Verdict
- Pièges E01 : claude.ai — premier message au moins 12 s après le chargement, « Actualiser la liste d'outils » puis nouvelle conversation, déconnecter puis reconnecter a fait disparaître les outils plusieurs minutes (mesurer, et garder ce geste pour la fin) ; en E01, « Se connecter maintenant » échouait sans jamais contacter le serveur : c'est cette fois le vrai test ; ChatGPT — `@connecteur`, bouton « Actualiser » de la fiche, annonce des succès qui n'ont pas eu lieu : le journal fait foi

## Critères d'acceptation

- [ ] **Given** JB confirme que le navigateur est libre **When** claude.ai : connecteur Acme ajouté avec « Se connecter maintenant » **Then** journal : métadonnées lues (forme d'URL, user-agent), 401, consentement (client `claude.ai`, adresse de retour, scopes), `initialize`, `tools/list`, `acme_whoami` ; heure de chaque geste ; si l'ajout échoue, le message exact du host et ce que le journal a vu ou non
- [ ] **Given** Delta ajouté à côté **Then** deux clients, chaque `whoami` sa propre organisation ; noter si le consentement de Delta s'affiche sur l'hôte Acme avec la marque Acme (mesure de l'adresse de site unique)
- [ ] **Given** l'alias connecté sur le site (JB déconnecté, alias connecté) **When** Delta est reconnecté **Then** connexion et consentement passent, `delta_whoami` refusé avec le message nommant Delta, `acme_whoami` accepté ; ce que le host montre à l'utilisateur
- [ ] **Given** expiration (durée des jetons baissée par JB) puis révocation (grants, puis session) **Then** comportement de claude.ai au journal et à l'écran ; retour à 3 600 s
- [ ] **Given** reconnexion : « Actualiser la liste d'outils », nouvelle conversation, puis, en dernier, déconnecter / reconnecter **Then** métadonnées et `tools/list` relus ou non, durée d'indisponibilité des outils mesurée
- [ ] **Given** ChatGPT : connecteur OAuth en mode développeur, sélection `@Acme` **Then** mêmes preuves 5 à 10 ; bouton « Actualiser » comme geste de rafraîchissement ; chaque succès annoncé recoupé au journal
- [ ] **Given** Claude Desktop (si JB le fait) et les apps mobiles Claude et ChatGPT (si simple) **Then** parcours complet : oui / non, avec le point d'échec
- [ ] **Given** chaque host **Then** rapport de frictions recoupé au journal
- [ ] **Given** `docs/bench/results-oauth.md` **Then** complet : matrice host × preuves, relevés par host (nom du client, adresse de retour, scopes, `aud`, `client_id`, `resource`, consentement), frictions, chaque fait avec sa requête
- [ ] **Given** ADR-004 §Verdict **Then** rempli : Supabase suffit, ou il faut une façade, et pour quoi ; par host, daté, avec la version cliente ; statut de l'ADR passé à Accepté ou Amendé
- [ ] **Given** la section « Changements proposés » **Then** pour la section « Connexion et identité » du doc technique : section visée, texte actuel, texte proposé, mesure qui le justifie ; le doc Claude n'est pas modifié
- [ ] **Given** la fin **Then** réglages Supabase (adresse de site, durée des jetons) et Vercel remis ou laissés selon JB, connecteurs retirés s'il le demande, résumé court à JB (verdict, trois faits, ce qui change au doc)

## Implémentation

### Fichiers à modifier
- `docs/bench/results-oauth.md`, `docs/decisions/ADR-004-auth-assistants-supabase-oauth.md`
- `.claude/conventions/mcp-patterns.md` §6 seulement si une mesure contredit une règle datée (statut + date, comme en E01-S05)

### Patterns à suivre
- `mcp-patterns.md` §8 (gestes de rafraîchissement par host, recoupement)
- Jamais un jeton, un mot de passe ni un lien magique dans la conversation ou les fichiers

## Tests attendus

### Unit tests
- [ ] N/A (campagne)

### Integration tests
- [ ] N/A

### E2E tests
- [ ] Les runs, relus au journal

## Post-implémentation

Jouée le 2026-09-23 (16:27–17:10 UTC) par le pilote dans le navigateur Playwright (sessions claude.ai et ChatGPT de JB), coupée à 17:20 sur demande de JB. Résultats : `docs/bench/results-oauth.md` ; verdict : ADR-004 §Verdict (Accepté, décision 7 amendée) ; changements proposés au doc : dernière section de `results-oauth.md`.

### Écarts avec la story
- Connecteurs ajoutés et connectés par le pilote (mot de passe lu dans `.env.local` du worktree par le navigateur, jamais affiché), pas par JB.
- Adresse de site Supabase inchangée (refus motivé de JB) : consentement sur `mcp-test-navy.vercel.app` après avance de `main` ; marque « Banc MCP » = mesure de l'adresse de site unique.
- Non joué (coupé) : preuve 7 claude.ai (prouvée sur Claude Code et ChatGPT), 8a/8b après expiration (durée des jetons non baissée ; côté serveur, tests S07), déconnexion/reconnexion claude.ai, Claude Desktop, mobiles.
- Rapport de frictions P15 non demandé aux modèles ; frictions relevées par le pilote au journal.

### Option plus simple écartée
Attendre JB pour les connexions et l'expiration : écarté à sa demande (« fais un maximum seul ») ; la mesure après expiration exigeait 1 h d'attente par jeton, coupée.

### Notes
- Vercel Authentication laissée désactivée (à remettre en `all_except_custom_domains` si les domaines de branche ne servent plus) ; connecteurs Acme/Delta laissés sur claude.ai, ChatGPT et Claude Code (`claude mcp remove <nom> -s local`).
