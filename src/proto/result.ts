// Contrat commun des services proto et de l'adaptateur MCP (architecture §9.2) : un service rend un
// texte, ou lève un refus actionnable que l'adaptateur rend tel quel au modèle. Sans cette frontière,
// chaque service inventerait sa forme d'erreur et l'adaptateur ne saurait pas distinguer un refus
// (à montrer) d'une panne (à cacher).

/** Refus actionnable : son message est lu par le modèle (`isError`), il dit quoi faire. */
export class ProtoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProtoError"
  }
}

export type ServiceResult = {
  /** Ce que le modèle lit, servi à l'identique en texte et en `structuredContent.text`. */
  text: string
  /** Fonction ou chemin touché, pour le journal. */
  target?: string | null
  /** Équipe sous laquelle l'appel a couru, pour le journal. */
  teamId?: string | null
  /** Code ctx émis par ce résultat (context seulement), pour le journal. */
  ctx?: string
}
