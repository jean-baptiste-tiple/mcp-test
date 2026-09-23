// Routage des intentions (E04-S02 ; doc fonctionnel, « Routage des intentions » et « Sûreté de la
// reconnaissance »). proto.route_candidates rend les composantes lexicales ; ici on les mélange en un
// score entre 0 et 1, on ajoute les bonus (équipe, usage) et on décide : étapes servies seulement si
// le premier candidat est net. Sans ce module, context ne reconnaît rien et find ne classe rien.
import type { ProtoDb } from "../db"
import { many } from "../db"
import { canRead, type Identity } from "../identity"

export type Candidate = {
  nodeId: string
  path: string
  title: string
  summary: string
  kind: string
  score: number
}

export type Components = { s_trigger: number; s_neighbor: number; s_title: number; lexical: number; query_lexemes: number }

// Calibration du 2026-09-23 sur tests/integration/proto-routing.cases.ts : 132 phrases (54
// déclencheuses, 37 paraphrases non stockées, 27 voisines, 8 hors procédure, 6 requêtes courtes
// ambiguës), grille poids × seuil × écart × atténuation. Point retenu : précision 100 % des étapes
// servies, 32 paraphrases servies sur 37 sans bonus (34 avec les bonus d'équipe du test d'intégration),
// premier candidat juste 100 %, aucune voisine, phrase hors
// procédure ou requête ambiguë servie. Marges sous le seuil : 0,50 pour la meilleure requête
// ambiguë ou hors procédure, 0,46 pour une voisine sur sa propre procédure. Le départ du doc
// fonctionnel (0,85 et 0,2) ne servait aucune paraphrase avec ce mélange.
// Phrases ou titre (le titre porte seul les pages et tableaux, sans phrases), puis lexèmes partagés.
export const WEIGHTS = { phrase: 0.55, lexical: 0.45 }
/** Sous ce nombre de lexèmes, la part lexicale est atténuée : « relance » seul trouvait tous ses lexèmes. */
export const SHORT_QUERY_LEXEMES = 2
export const TEAM_BONUS = 0.03
export const USAGE_BONUS = 0.03
export const SERVE_THRESHOLD = 0.65
export const SERVE_GAP = 0.1
/** Sous ce score, un candidat n'est pas montré du tout. */
export const SHOW_THRESHOLD = 0.3

/** Pré-sélection SQL, large devant la taille d'un arbre de maquette ; le vrai classement est ici. */
const PREFILTER = 50
const ROUTING_USAGE_DAYS = 30

export function blendScore(c: Components): number {
  const lexical = c.lexical * Math.min(1, c.query_lexemes / SHORT_QUERY_LEXEMES)
  let score = WEIGHTS.phrase * Math.max(c.s_trigger, c.s_title) + WEIGHTS.lexical * lexical
  // Une voisine plus proche qu'une déclencheuse retire l'écart entre les deux.
  if (c.s_neighbor > c.s_trigger) score -= c.s_neighbor - c.s_trigger
  return Math.max(0, Math.min(1, score))
}

/** Étapes servies : premier au-dessus du seuil, avec un écart net sur le deuxième. */
export function decide(candidates: Candidate[]): Candidate | null {
  const [first, second] = candidates
  if (!first || first.score < SERVE_THRESHOLD) return null
  if (second && first.score - second.score < SERVE_GAP) return null
  return first
}

/** Candidats lisibles par l'utilisateur, triés, score final dans [0, 1]. */
export async function rankCandidates(
  db: ProtoDb,
  identity: Identity,
  query: string,
  kind: "procedure" | "page" | "table" | null,
  limit: number
): Promise<Candidate[]> {
  const since = new Date(Date.now() - ROUTING_USAGE_DAYS * 86_400_000).toISOString()
  const [rows, usage] = await Promise.all([
    db.rpc("route_candidates", { p_org: identity.org.id, p_query: query, p_kind: kind ?? undefined, p_limit: PREFILTER }),
    db
      .from("journal")
      .select("target")
      .eq("user_id", identity.user.id)
      .gte("ts", since)
      .not("target", "is", null)
      .order("ts", { ascending: false })
      .limit(2000),
  ])
  const used = new Set(many(usage, "journal").map((r) => r.target))
  const myTeams = new Set(identity.teams.filter((t) => t.member).map((t) => t.id))

  return many(rows, "route_candidates")
    .filter((r) => canRead(identity, r.team_id))
    .map((r) => {
      const bonus = (r.team_id && myTeams.has(r.team_id) ? TEAM_BONUS : 0) + (used.has(r.path) ? USAGE_BONUS : 0)
      return { nodeId: r.node_id, path: r.path, title: r.title, summary: r.summary, kind: r.kind, score: Math.min(1, blendScore(r) + bonus) }
    })
    .filter((c) => c.score >= SHOW_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
}

export function formatScore(score: number): string {
  return score.toFixed(2)
}
