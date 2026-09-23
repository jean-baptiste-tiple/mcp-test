// Jeu de phrases de test du routage (E04-S02, preuve 4). Les paraphrases ne sont JAMAIS copiées dans
// scripts/lib/proto-data.mjs : elles mesurent ce que le serveur reconnaît sans les avoir vues.
// Les phrases déclencheuses et voisines stockées sont ajoutées par le test depuis proto-data.mjs.

export type RoutingCase = {
  phrase: string
  /** Procédure attendue ; null : aucune étape ne doit être servie ; absent : tout sauf `forbid`. */
  expect?: string | null
  /** Procédures dont les étapes ne doivent jamais être servies pour cette phrase. */
  forbid?: string[]
  kind: "paraphrase" | "negative" | "trigger" | "neighbor" | "ambiguous"
}

const P = (expect: string, phrases: string[]): RoutingCase[] =>
  phrases.map((phrase) => ({ phrase, expect, kind: "paraphrase" }))

export const ACME_PARAPHRASES: RoutingCase[] = [
  ...P("ventes/relance_devis", [
    "peux-tu relancer les devis qui sont en attente ?",
    "relance les clients qui n'ont pas répondu à leur devis",
    "fais une relance des devis envoyés sans retour",
    "il faut relancer nos devis en souffrance",
  ]),
  ...P("ventes/relance_prospects", [
    "relance les prospects de la liste",
    "recontacte les leads à traiter",
    "envoie une relance aux prospects qui attendent",
  ]),
  ...P("ventes/qualifier_prospects", [
    "qualifie les prospects de la file",
    "complète les fiches des prospects à traiter",
    "enrichis les fiches du suivi des prospects",
  ]),
  ...P("ventes/point_pipeline", [
    "fais-moi le point sur le pipeline commercial",
    "où en est le pipe ?",
    "combien de prospects avons-nous par statut ?",
  ]),
  ...P("support/reponse_ticket", [
    "aide-moi à répondre à ce client",
    "prépare la réponse à ce ticket support",
    "que dois-je répondre à ce client ?",
  ]),
  ...P("support/escalade_incident", [
    "escalade cette panne à l'astreinte",
    "signale cet incident critique à l'équipe technique",
    "il y a une coupure sur plusieurs sites, préviens l'astreinte",
  ]),
  ...P("support/synthese_hebdo", [
    "fais le bilan de la semaine du support",
    "résume les tickets support de cette semaine",
    "poste la synthèse hebdo du support sur Slack",
  ]),
  ...P("conseil/preparer_rdv", [
    "prépare mon rdv de demain avec ce client",
    "fais-moi un brief avant ma réunion client",
    "prépare le rendez-vous avec la mairie",
  ]),
  ...P("conseil/compte_rendu_rdv", [
    "rédige le CR de la réunion d'hier",
    "écris le compte rendu du rendez-vous client",
    "fais le compte-rendu de notre réunion",
  ]),
  ...P("conseil/etude_autoconso", [
    "lance une étude ACC pour ce site",
    "démarre une étude d'autoconsommation collective",
    "étudie le potentiel d'autoconso pour la mairie",
  ]),
]

export const ACME_NEGATIVES: RoutingCase[] = [
  "quelle heure est-il ?",
  "écris-moi un poème sur la mer",
  "traduis ce texte en anglais",
  "quel temps fera-t-il demain ?",
  "combien font 17 fois 23 ?",
  "donne-moi une recette de crêpes",
  "qui a gagné le match hier soir ?",
  "explique-moi la photosynthèse",
].map((phrase) => ({ phrase, expect: null, kind: "negative" as const }))

/** Requêtes d'un ou deux mots qui touchent plusieurs procédures : aucune étape ne doit être servie. */
export const ACME_AMBIGUOUS: RoutingCase[] = [
  "relance",
  "prospects",
  "devis",
  "le client",
  "une étude",
  "réunion",
].map((phrase) => ({ phrase, expect: null, kind: "ambiguous" as const }))

export const DELTA_PARAPHRASES: RoutingCase[] = [
  ...P("exploitation/planifier_tournee", ["organise les tournées de livraison de demain", "fais le plan des tournées"]),
  ...P("exploitation/inventaire_stock", ["lance l'inventaire de l'entrepôt", "compte le stock"]),
  ...P("exploitation/incident_livraison", ["un colis a été perdu", "déclare un retard de livraison"]),
]
