// Données fictives du serveur proto (E04, architecture §9) : deux clients, Acme Énergies (`acme_`)
// et Delta Logistique (`delta_`). SOURCE UNIQUE : `pnpm proto:seed` et les tests d'intégration
// les chargent par seedProto() (proto-seed.mjs). Sans elles, le serveur n'a personne à servir, et
// le routage n'a ni phrases déclencheuses ni voisines à départager.
//
// Aucun nom de client réel : entreprises, villes et domaines d'email sont inventés (`.test`).
// Les phrases de test du routage (paraphrases non stockées) vivent dans les tests, jamais ici.

/** Code de l'appel exact d'une étape, tel que le modèle le recopie. */
const call = (fn, args) => "```\nacme_call " + JSON.stringify({ function: fn, arguments: args }) + "\n```"
const dcall = (fn, args) => "```\ndelta_call " + JSON.stringify({ function: fn, arguments: args }) + "\n```"
/** Envoi en deux temps : l'appel sans confirm rend un récapitulatif ; confirm: true à la racine, après accord. */
const SEND_TWO_STEPS =
  "Un premier appel sans confirm rend un récapitulatif ; après l'accord explicite de la personne, le même appel avec confirm: true à la racine :\n```\nacme_call " +
  JSON.stringify({ function: "mail.send_draft", arguments: { id: "<id du brouillon>" }, confirm: true }) +
  "\n```"

function procedure(when, steps, rules) {
  return [
    { title: "Quand l'utiliser", body: when },
    { title: "Étapes", body: steps.map((step, i) => `${i + 1}. ${step}`).join("\n\n") },
    { title: "Règles", body: rules },
  ]
}

const ANNOUNCE = "Annonce en une phrase ce que tu vas faire."

// --- Page longue : conseil/methode_etude (plus de 25 000 caractères, 12 sections) ------------------

const STUDY_SECTIONS = [
  ["Objet de l'étude", "Définir le périmètre d'une étude d'autoconsommation collective : bâtiments producteurs, consommateurs du périmètre, contraintes du réseau de distribution."],
  ["Collecte des données", "Rassembler les courbes de charge au pas de 30 minutes, les factures des douze derniers mois et les plans de toiture de chaque site."],
  ["Visite technique", "Vérifier sur place l'orientation, les ombrages, l'état de la charpente et l'accès au tableau général basse tension."],
  ["Gisement solaire", "Estimer la production mensuelle par pan de toiture à partir de l'irradiation locale, de l'inclinaison et des pertes système."],
  ["Dimensionnement", "Choisir la puissance crête qui maximise le taux d'autoconsommation sans dépasser le seuil de rentabilité fixé avec le client."],
  ["Clé de répartition", "Comparer la clé statique, la clé dynamique par défaut et une clé dynamique personnalisée selon les profils de consommation."],
  ["Taux d'autoconsommation", "Calculer la part de la production consommée dans le périmètre, heure par heure, sur une année type."],
  ["Taux d'autoproduction", "Calculer la part de la consommation couverte par la production locale, par participant et pour l'ensemble de l'opération."],
  ["Modèle économique", "Établir le prix de vente de l'énergie locale, les frais de la personne morale organisatrice et le temps de retour."],
  ["Montage juridique", "Rédiger les statuts de la personne morale organisatrice et la convention avec le gestionnaire de réseau."],
  ["Risques", "Lister les risques techniques, contractuels et financiers, avec pour chacun une mesure de réduction et un responsable."],
  ["Restitution", "Présenter au client la synthèse, les trois scénarios chiffrés et la recommandation, puis déposer le rapport dans son dossier."],
]

const STUDY_POINTS = [
  "vérifier que la donnée couvre au moins douze mois consécutifs",
  "noter la source et la date de chaque valeur reprise",
  "signaler toute hypothèse au client avant de l'utiliser",
  "comparer le résultat au ratio de référence de l'équipe Conseil",
  "consigner l'écart et sa cause dans le dossier d'étude",
  "faire relire le calcul par un second consultant",
]

function studySection([title, intro], index) {
  const lines = [intro, ""]
  for (let point = 1; point <= 20; point += 1) {
    const detail = STUDY_POINTS[(index + point) % STUDY_POINTS.length]
    lines.push(`- Point ${index + 1}.${point} : pour « ${title.toLowerCase()} », ${detail}.`)
  }
  lines.push("", `Livrable de l'étape ${index + 1} : une note d'une page déposée dans le dossier d'étude, datée et signée.`)
  return { title, body: lines.join("\n") }
}

// --- Acme Énergies ---------------------------------------------------------------------------------

const PROSPECT_STATES = ["à traiter", "en cours", "relancé", "gagné", "perdu"]

const PROSPECTS = [
  ["P-001", "Boulangerie des Tilleuls", "Marion Vasseur", "Valbrune", "à traiter", "2026-08-28", 12000],
  ["P-002", "Camping Les Pins Bleus", "Hugo Ferrand", "Saint-Arlan", "à traiter", "2026-09-02", 48000],
  ["P-003", "Mairie de Valbrune", "Sophie Lacaze", "Valbrune", "en cours", "2026-09-10", 95000],
  ["P-004", "Garage Moreau Frères", "Luc Moreau", "Brémontier", "relancé", "2026-09-05", 18000],
  ["P-005", "Ferme du Grand Coudray", "Anne Delorme", "Coudray-sur-Lise", "à traiter", "2026-08-20", 30000],
  ["P-006", "Clinique vétérinaire des Saules", "Paul-Henri Rives", "Saint-Arlan", "gagné", "2026-07-15", 22000],
  ["P-007", "Collège Jean-Rostand de Brémontier", "Claire Benoît", "Brémontier", "à traiter", "2026-09-12", 60000],
  ["P-008", "Scierie Vallet", "Denis Vallet", "Haute-Lise", "perdu", "2026-06-30", 40000],
  ["P-009", "Maison de santé du Plateau", "Inès Barral", "Valbrune", "en cours", "2026-09-15", 35000],
  ["P-010", "Brasserie de la Lise", "Tom Garnier", "Coudray-sur-Lise", "à traiter", "2026-09-01", 15000],
  ["P-011", "Salle des sports de Haute-Lise", "Julie Marchal", "Haute-Lise", "relancé", "2026-08-25", 52000],
  ["P-012", "Supérette du Marché", "Karim Haddad", "Saint-Arlan", "à traiter", "2026-09-18", 9000],
]

const ACME = {
  slug: "acme",
  name: "Acme Énergies",
  prefix: "acme",
  domains: "sales, customer support, energy consulting",
  topics: [
    { subject: "tarifs", path: "conseil/grille_tarifaire_2026" },
    { subject: "méthode d'étude", path: "conseil/methode_etude" },
    { subject: "FAQ support", path: "support/faq" },
    { subject: "modèle de relance", path: "ventes/modele_relance" },
    { subject: "prospects", path: "ventes/suivi_prospects" },
  ],
  teams: [
    {
      slug: "ventes",
      name: "Ventes",
      lead: "claire",
      rules: "Aucun email envoyé sans validation de la personne. Montants toujours en euros HT.",
      connectors: { sellsy: "write", mail: "write", slack: "write" },
    },
    {
      slug: "support",
      name: "Support",
      lead: "paul",
      rules: "Répondre sous 24 h ouvrées. Toute panne qui touche plus d'un site est un incident.",
      connectors: { mail: "write", slack: "write" },
    },
    {
      slug: "conseil",
      name: "Conseil",
      lead: "jb",
      rules: "Chaque étude cite ses sources et ses hypothèses. Référente facturation : Claire.",
      connectors: { sellsy: "read", mail: "write", slack: "write", probe: "write" },
    },
  ],
  users: [
    {
      slug: "jb",
      name: "Jean-Baptiste",
      role: "admin",
      default_team: "conseil",
      teams: ["conseil", "ventes", "support"],
      profile: {
        langue: "français",
        ton: "Tutoiement, phrases courtes. Termine chaque réponse finale par la signature « — ton assistant Acme ».",
        preferences: "Réponses en liste, montants en euros HT.",
      },
    },
    {
      slug: "claire",
      name: "Claire Morel",
      role: "member",
      default_team: "ventes",
      teams: ["ventes"],
      profile: { langue: "français", ton: "Vouvoiement, précis.", preferences: "Tableaux pour les chiffres." },
    },
    {
      slug: "paul",
      name: "Paul Girard",
      role: "member",
      default_team: "support",
      teams: ["support"],
      profile: { langue: "français", ton: "Tutoiement.", preferences: "Aller droit au but." },
    },
    {
      slug: "lea",
      name: "Léa Roux",
      role: "member",
      default_team: "ventes",
      teams: ["ventes"],
      profile: { langue: "français", ton: "Tutoiement.", preferences: "" },
    },
  ],
  vocabulary: [
    { term: "autoconsommation collective", synonyms: ["ACC", "autoconso", "autoconsommation"] },
    { term: "devis", synonyms: ["proposition commerciale", "offre", "DEV"] },
    { term: "prospect", synonyms: ["lead", "piste", "PdV"] },
    { term: "compte rendu", synonyms: ["CR", "compte-rendu"] },
    { term: "rendez-vous", synonyms: ["rdv", "RDV", "réunion"] },
    { term: "incident", synonyms: ["panne", "coupure", "bug"] },
    { term: "pipeline", synonyms: ["pipe", "entonnoir commercial"] },
  ],
  nodes: [
    {
      path: "guide",
      team: null,
      kind: "page",
      title: "Guide d'Acme Énergies",
      summary: "Mission, vocabulaire, règles et ton d'Acme Énergies : ce que tout assistant doit savoir avant d'agir.",
      sections: [
        { title: "Mission", body: "Acme Énergies conçoit et exploite des opérations d'autoconsommation collective pour des communes, des PME et des bailleurs, de l'étude à la mise en service. 150 personnes, trois équipes au contact des clients : Ventes, Support, Conseil." },
        { title: "Vocabulaire", body: "ACC : autoconsommation collective. PMO : personne morale organisatrice. Devis : proposition commerciale émise dans Sellsy, numérotée DEV-AAAA-NNN. Prospect : ligne du tableau ventes/suivi_prospects." },
        { title: "Règles", body: "Aucun email ni message externe n'est envoyé sans l'accord explicite de la personne. Les montants sont en euros HT. On ne promet jamais un taux d'autoconsommation avant l'étude." },
        { title: "Ton", body: "Clair, concret, sans jargon inutile. Avec les clients : vouvoiement. En interne : tutoiement." },
      ],
    },
    {
      path: "ventes/relance_devis",
      team: "ventes",
      kind: "procedure",
      meta: { suggested: true },
      title: "Relancer les devis en attente",
      summary: "Relance par email les devis envoyés sans réponse depuis 7 jours ou plus, après accord de la personne.",
      sections: procedure(
        "Quand des devis envoyés n'ont pas de réponse depuis au moins 7 jours.",
        [
          ANNOUNCE,
          "Liste les devis en attente :\n" + call("sellsy.list_estimates", { status: "sent", older_than_days: 7 }),
          "Pour chaque devis, prépare un brouillon avec le modèle de ventes/modele_relance :\n" + call("mail.create_draft", { to: "<email du contact>", subject: "Votre devis <numéro>", body: "<modèle rempli>" }),
          "Montre la liste des brouillons à la personne et demande son accord avant tout envoi.",
          "Seulement après son accord, envoie chaque brouillon. " + SEND_TWO_STEPS,
        ],
        "Jamais d'envoi sans accord. Un devis refusé ou accepté ne se relance pas."
      ),
      triggers: [
        "relance les devis en attente",
        "relancer les devis sans réponse",
        "qui n'a pas répondu à nos devis",
        "devis en souffrance",
        "fais les relances de devis",
      ],
      neighbors: ["relance les prospects", "combien de devis avons-nous envoyés ce mois-ci", "crée un nouveau devis"],
    },
    {
      path: "ventes/relance_prospects",
      team: "ventes",
      kind: "procedure",
      title: "Relancer les prospects à traiter",
      summary: "Prend les prospects « à traiter » de la file, prépare un email de relance pour chacun, puis les marque « relancé ».",
      sections: procedure(
        "Quand la personne veut recontacter les prospects du tableau de suivi qui attendent.",
        [
          ANNOUNCE,
          "Réserve jusqu'à 5 prospects :\n" + call("table.claim", { table: "ventes/suivi_prospects", worker: "<ton prénom>", limit: 5 }),
          "Pour chacun, prépare un brouillon :\n" + call("mail.create_draft", { to: "<email>", subject: "Suite à notre échange", body: "<texte>" }),
          "Montre les brouillons et demande l'accord avant tout envoi.",
          "Après envoi, marque chaque ligne et libère-la :\n" + call("table.release", { table: "ventes/suivi_prospects", key: "<id>", worker: "<ton prénom>", state: "relancé" }),
        ],
        "Une ligne réservée par un autre travailleur ne se touche pas."
      ),
      triggers: [
        "relance les prospects",
        "recontacte les prospects à traiter",
        "fais les relances de la liste de prospection",
        "relance les leads",
      ],
      neighbors: ["relance les devis en attente", "qualifie les prospects à traiter"],
    },
    {
      path: "ventes/qualifier_prospects",
      team: "ventes",
      kind: "procedure",
      title: "Qualifier les prospects à traiter",
      summary: "Complète les fiches des prospects à traiter (contact, montant estimé, notes) sans les contacter.",
      sections: procedure(
        "Quand des fiches de prospects sont incomplètes et qu'il faut les compléter avant toute relance.",
        [
          ANNOUNCE,
          "Lis le contrat du tableau :\n" + call("table.schema", { table: "ventes/suivi_prospects" }),
          "Réserve des lignes :\n" + call("table.claim", { table: "ventes/suivi_prospects", worker: "<ton prénom>", limit: 3 }),
          "Complète chaque ligne ; un champ cherché sans résultat se déclare avec verified_empty et la raison :\n" + call("table.write", { table: "ventes/suivi_prospects", rows: [{ key: "<id>", set: { notes: "<notes>" } }] }),
          "Libère chaque ligne en « en cours » :\n" + call("table.release", { table: "ventes/suivi_prospects", key: "<id>", worker: "<ton prénom>", state: "en cours" }),
        ],
        "Ne jamais inventer un contact. Ne jamais écrire null."
      ),
      triggers: [
        "qualifie les prospects à traiter",
        "traite la file de prospection",
        "complète les fiches prospects",
        "enrichis le suivi des prospects",
      ],
      neighbors: ["relance les prospects", "fais le point sur le pipeline"],
    },
    {
      path: "ventes/point_pipeline",
      team: "ventes",
      kind: "procedure",
      title: "Faire le point sur le pipeline",
      summary: "Compte les prospects par statut, liste les devis en attente et poste la synthèse sur Slack après accord.",
      sections: procedure(
        "Quand la personne veut une vue d'ensemble de l'activité commerciale.",
        [
          ANNOUNCE,
          "Compte les prospects par statut :\n" + call("table.aggregate", { table: "ventes/suivi_prospects", group_by: "statut" }),
          "Liste les devis envoyés :\n" + call("sellsy.list_estimates", { status: "sent" }),
          "Rédige une synthèse de cinq lignes et montre-la.",
          "Après accord, poste-la :\n" + call("slack.post_message", { channel: "#ventes", text: "<synthèse>" }),
        ],
        "Montants en euros HT."
      ),
      triggers: [
        "fais le point sur le pipeline",
        "où en est le pipe commercial",
        "résume le suivi des prospects",
        "combien de prospects par statut",
      ],
      neighbors: ["qualifie les prospects à traiter", "relance les devis en attente"],
    },
    {
      path: "support/reponse_ticket",
      team: "support",
      kind: "procedure",
      meta: { suggested: true },
      title: "Répondre à un ticket client",
      summary: "Prépare une réponse à un client à partir de la FAQ support, en brouillon, envoyée seulement après accord.",
      sections: procedure(
        "Quand un client pose une question ou signale un problème qui ne touche que lui.",
        [
          ANNOUNCE,
          "Lis la FAQ :\n```\nacme_read {\"path\": \"support/faq\"}\n```",
          "Prépare le brouillon de réponse :\n" + call("mail.create_draft", { to: "<email du client>", subject: "Re: <objet>", body: "<réponse>" }),
          "Montre le brouillon et demande l'accord avant envoi. " + SEND_TWO_STEPS,
        ],
        "Vouvoiement avec les clients. Si le problème touche plusieurs sites, c'est un incident : procédure support/escalade_incident."
      ),
      triggers: [
        "réponds à ce client",
        "traite ce ticket",
        "que répondre à ce client",
        "prépare une réponse au ticket",
        "rédige la réponse support",
      ],
      neighbors: ["escalade cet incident", "fais la synthèse de la semaine du support"],
    },
    {
      path: "support/escalade_incident",
      team: "support",
      kind: "procedure",
      title: "Escalader un incident",
      summary: "Signale une panne qui touche plusieurs sites à l'astreinte technique sur Slack, avec les faits connus.",
      sections: procedure(
        "Quand une panne ou une coupure touche plusieurs sites, ou qu'un client signale un danger.",
        [
          ANNOUNCE,
          "Rassemble les faits : sites touchés, heure de début, symptômes.",
          "Après accord, préviens l'astreinte :\n" + call("slack.post_message", { channel: "#astreinte", text: "<faits>" }),
        ],
        "Ne jamais promettre un délai de rétablissement."
      ),
      triggers: [
        "escalade cet incident",
        "remonte cette panne à l'astreinte",
        "signale un incident critique",
        "préviens l'équipe technique d'une panne",
      ],
      neighbors: ["réponds à ce client", "traite ce ticket"],
    },
    {
      path: "support/synthese_hebdo",
      team: "support",
      kind: "procedure",
      title: "Synthèse hebdomadaire du support",
      summary: "Résume les tickets de la semaine en cinq lignes et poste la synthèse sur Slack après accord.",
      sections: procedure(
        "Le vendredi, ou quand la personne demande le bilan de la semaine du support.",
        [
          ANNOUNCE,
          "Rédige la synthèse : volume, sujets récurrents, incidents, délai moyen.",
          "Après accord, poste-la :\n" + call("slack.post_message", { channel: "#support", text: "<synthèse>" }),
        ],
        "Aucun nom de client dans la synthèse."
      ),
      triggers: [
        "fais la synthèse de la semaine du support",
        "bilan hebdo du support",
        "résume les tickets de la semaine",
        "poste le récap support sur Slack",
      ],
      neighbors: ["fais le point sur le pipeline", "réponds à ce client"],
    },
    {
      path: "conseil/preparer_rdv",
      team: "conseil",
      kind: "procedure",
      meta: { suggested: true },
      title: "Préparer un rendez-vous client",
      summary: "Rassemble devis, historique et points d'attention avant un rendez-vous, en une fiche d'une page.",
      sections: procedure(
        "Avant un rendez-vous avec un client ou un prospect.",
        [
          ANNOUNCE,
          "Retrouve ses devis :\n" + call("sellsy.list_estimates", {}),
          "Lis le détail du devis concerné :\n" + call("sellsy.get_estimate", { id: "<numéro>" }),
          "Rédige une fiche d'une page : contexte, chiffres, trois questions à poser.",
        ],
        "Lecture seule : rien n'est envoyé."
      ),
      triggers: [
        "prépare mon rendez-vous avec le client",
        "prépare le rdv de demain",
        "brief avant ma réunion client",
        "qu'est-ce que je dois savoir avant de voir ce client",
      ],
      neighbors: ["rédige le compte rendu du rendez-vous", "lance une étude d'autoconsommation"],
    },
    {
      path: "conseil/compte_rendu_rdv",
      team: "conseil",
      kind: "procedure",
      title: "Rédiger le compte rendu d'un rendez-vous",
      summary: "Écrit le compte rendu d'un rendez-vous dans une page du dossier client, puis propose l'email de suivi.",
      sections: procedure(
        "Après un rendez-vous, quand la personne dicte ou résume ce qui s'est dit.",
        [
          ANNOUNCE,
          "Crée la page du compte rendu en brouillon :\n```\nacme_write {\"path\": \"conseil/cr_<client>_<date>\", \"kind\": \"page\", \"title\": \"CR <client>\", \"summary\": \"<une ligne>\", \"ops\": [{\"op\": \"add_section\", \"section\": \"Décisions\", \"text\": \"<décisions>\"}]}\n```",
          "Relis-la avec la personne, puis publie avec publish: true.",
          "Propose l'email de suivi en brouillon :\n" + call("mail.create_draft", { to: "<email>", subject: "Compte rendu de notre rendez-vous", body: "<résumé>" }),
        ],
        "Un compte rendu ne contient que ce qui a été dit."
      ),
      triggers: [
        "rédige le compte rendu du rendez-vous",
        "fais le CR de la réunion",
        "écris le compte rendu client",
        "note ce qui s'est dit au rendez-vous",
      ],
      neighbors: ["prépare mon rendez-vous avec le client", "envoie un email au client"],
    },
    {
      path: "conseil/etude_autoconso",
      team: "conseil",
      kind: "procedure",
      title: "Lancer une étude d'autoconsommation",
      summary: "Démarre une étude d'autoconsommation collective en suivant la méthode d'étude, étape par étape.",
      sections: procedure(
        "Quand un client veut connaître le potentiel d'une opération d'autoconsommation collective.",
        [
          ANNOUNCE,
          "Lis le plan de la méthode :\n```\nacme_read {\"path\": \"conseil/methode_etude\", \"outline\": true}\n```",
          "Lis la section utile, par exemple :\n```\nacme_read {\"path\": \"conseil/methode_etude\", \"section\": \"Collecte des données\"}\n```",
          "Liste avec la personne les données à demander au client.",
        ],
        "Aucun taux promis avant l'étude."
      ),
      triggers: [
        "lance une étude d'autoconsommation",
        "démarre une étude ACC",
        "étudie le potentiel d'autoconsommation collective",
        "fais une pré-étude solaire pour ce site",
      ],
      neighbors: ["prépare mon rendez-vous avec le client", "quels sont nos tarifs d'étude"],
    },
    {
      path: "conseil/methode_etude",
      team: "conseil",
      kind: "page",
      title: "Méthode d'étude d'autoconsommation collective",
      summary: "La méthode d'Acme pour une étude d'autoconsommation collective, en douze étapes, de la collecte à la restitution.",
      sections: STUDY_SECTIONS.map(studySection),
    },
    {
      path: "conseil/grille_tarifaire_2026",
      team: "conseil",
      kind: "page",
      title: "Grille tarifaire 2026",
      summary: "Tarifs 2026 des études et de l'accompagnement, en euros HT.",
      sections: [
        { title: "Études", body: "Pré-étude : 1 500 € HT. Étude complète jusqu'à 10 participants : 6 500 € HT. Par participant supplémentaire : 250 € HT." },
        { title: "Accompagnement", body: "Montage de la PMO : 3 000 € HT. Suivi annuel de l'opération : 1 200 € HT par an." },
      ],
    },
    {
      path: "support/faq",
      team: "support",
      kind: "page",
      title: "FAQ support",
      summary: "Réponses types aux questions fréquentes des participants aux opérations d'autoconsommation.",
      sections: [
        { title: "Facture", body: "La part locale apparaît sur une ligne distincte de la facture du fournisseur, avec le prix fixé par la PMO." },
        { title: "Coupure", body: "Une coupure du réseau coupe aussi la production locale : c'est une sécurité. Si elle touche plusieurs sites, escalader." },
        { title: "Changement de fournisseur", body: "Le participant garde sa part locale s'il change de fournisseur ; prévenir la PMO sous 30 jours." },
      ],
    },
    {
      path: "ventes/modele_relance",
      team: "ventes",
      kind: "page",
      title: "Modèle d'email de relance",
      summary: "Le modèle d'email de relance d'un devis, à personnaliser avec le numéro et le prénom du contact.",
      sections: [
        { title: "Objet", body: "Votre devis <numéro> — une question ?" },
        { title: "Corps", body: "Bonjour <prénom>,\n\nJe reviens vers vous au sujet du devis <numéro> envoyé le <date>. Avez-vous pu le parcourir ? Je peux vous l'expliquer en quinze minutes, quand vous voulez.\n\nBien cordialement," },
      ],
    },
    {
      path: "ventes/suivi_prospects",
      team: "ventes",
      kind: "table",
      title: "Suivi des prospects",
      summary: "Les prospects de l'équipe Ventes, avec leur statut, et la file de travail des prospects à traiter.",
      sections: [],
      meta: {
        key: "id",
        state_column: "statut",
        states: PROSPECT_STATES,
        columns: [
          { name: "entreprise", type: "text" },
          { name: "contact", type: "text" },
          { name: "email", type: "text" },
          { name: "ville", type: "text" },
          { name: "statut", type: "enum", values: PROSPECT_STATES },
          { name: "dernier_contact", type: "date" },
          { name: "montant_estime", type: "number" },
          { name: "notes", type: "text" },
        ],
      },
      rows: PROSPECTS.map(([key, entreprise, contact, ville, statut, dernier_contact, montant_estime]) => ({
        key,
        values: {
          entreprise,
          contact,
          email: `${contact.toLowerCase().split(" ")[0].normalize("NFD").replace(/[^a-z-]/g, "")}@${ville.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.test`,
          ville,
          statut,
          dernier_contact,
          montant_estime,
        },
      })),
    },
  ],
}

// --- Delta Logistique ------------------------------------------------------------------------------

const DELTA = {
  slug: "delta",
  name: "Delta Logistique",
  prefix: "delta",
  domains: "logistics, delivery rounds, warehouse stock",
  topics: [{ subject: "consignes d'entrepôt", path: "exploitation/consignes" }],
  teams: [
    {
      slug: "exploitation",
      name: "Exploitation",
      lead: "jb-delta",
      rules: "Tout retard de plus de deux heures est signalé au client le jour même.",
      connectors: { mail: "write", slack: "write" },
    },
  ],
  users: [
    {
      slug: "jb-delta",
      name: "Jean-Baptiste",
      role: "admin",
      default_team: "exploitation",
      teams: ["exploitation"],
      profile: { langue: "français", ton: "Tutoiement, phrases courtes.", preferences: "" },
    },
  ],
  vocabulary: [
    { term: "tournée", synonyms: ["tournées", "circuit", "run"] },
    { term: "colis", synonyms: ["paquet", "envoi"] },
  ],
  nodes: [
    {
      path: "guide",
      team: null,
      kind: "page",
      title: "Guide de Delta Logistique",
      summary: "Mission et règles de Delta Logistique, transporteur régional et gestionnaire d'entrepôt.",
      sections: [
        { title: "Mission", body: "Delta Logistique livre les commerces de la région depuis deux entrepôts, en tournées quotidiennes." },
        { title: "Règles", body: "Aucun message client sans accord. Un retard de plus de deux heures est signalé le jour même." },
      ],
    },
    {
      path: "exploitation/consignes",
      team: "exploitation",
      kind: "page",
      title: "Consignes d'entrepôt",
      summary: "Horaires, zones de quai et règles de sécurité des deux entrepôts.",
      sections: [{ title: "Horaires", body: "Quais ouverts de 5 h à 20 h ; départs des tournées à 6 h 30." }],
    },
    {
      path: "exploitation/planifier_tournee",
      team: "exploitation",
      kind: "procedure",
      meta: { suggested: true },
      title: "Planifier les tournées",
      summary: "Répartit les livraisons du lendemain entre les chauffeurs et poste le plan sur Slack après accord.",
      sections: procedure(
        "La veille, pour organiser les livraisons du lendemain.",
        [ANNOUNCE, "Propose une répartition par zone et par chauffeur.", "Après accord, poste le plan :\n" + dcall("slack.post_message", { channel: "#tournees", text: "<plan>" })],
        "Pas plus de 40 arrêts par tournée."
      ),
      triggers: ["planifie les tournées de demain", "organise les livraisons de demain", "prépare le plan de tournée", "répartis les colis entre les chauffeurs"],
      neighbors: ["signale un retard de livraison", "fais l'inventaire du stock"],
    },
    {
      path: "exploitation/inventaire_stock",
      team: "exploitation",
      kind: "procedure",
      title: "Faire l'inventaire du stock",
      summary: "Guide le comptage du stock d'un entrepôt et poste les écarts constatés sur Slack.",
      sections: procedure(
        "Pour un inventaire tournant ou de fin de mois.",
        [ANNOUNCE, "Liste les allées à compter avec la personne.", "Après accord, poste les écarts :\n" + dcall("slack.post_message", { channel: "#entrepot", text: "<écarts>" })],
        "Un écart de plus de 2 % se recompte."
      ),
      triggers: ["fais l'inventaire du stock", "compte le stock de l'entrepôt", "vérifie les écarts d'inventaire", "lance un inventaire tournant"],
      neighbors: ["planifie les tournées de demain", "signale un retard de livraison"],
    },
    {
      path: "exploitation/incident_livraison",
      team: "exploitation",
      kind: "procedure",
      title: "Déclarer un incident de livraison",
      summary: "Déclare un retard, un colis perdu ou endommagé, et prépare le message au client après accord.",
      sections: procedure(
        "Quand une livraison est en retard, perdue ou endommagée.",
        [ANNOUNCE, "Prépare le message au client :\n" + dcall("mail.create_draft", { to: "<email>", subject: "Votre livraison", body: "<message>" }), "Montre-le et demande l'accord avant envoi."],
        "Ne jamais promettre une heure de livraison."
      ),
      triggers: ["signale un retard de livraison", "un colis est perdu", "déclare un incident de livraison", "préviens le client d'un retard"],
      neighbors: ["planifie les tournées de demain", "fais l'inventaire du stock"],
    },
  ],
}

export const PROTO_ORGS = [ACME, DELTA]
