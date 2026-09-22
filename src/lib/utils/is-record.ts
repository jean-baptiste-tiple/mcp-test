/**
 * Garde d'objet JSON simple (ni null, ni tableau). Factorisée ici parce que le journal et
 * les leviers la font tous deux sur des données non fiables — un body JSON-RPC et une
 * colonne `jsonb` libre — et qu'une divergence entre les deux copies ferait diverger ce qui
 * est mesuré de ce qui est servi.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
