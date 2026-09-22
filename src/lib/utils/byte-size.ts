// Les plafonds du banc (architecture §7) sont en OCTETS, pas en caractères : `"é".length`
// vaut 1 mais pèse 2 octets, et un argument d'emojis passerait un contrôle par `.length`
// en pesant 4× plus en base. Utilisé par le plafond d'arguments (64 ko, handlers) et par la
// troncature du journal (8 ko, bench_events.args).
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function byteLength(text: string): number {
  return encoder.encode(text).length
}

/** Coupe à `maxBytes` octets ; un caractère coupé en deux devient U+FFFD (decoder non fatal). */
export function truncateToBytes(text: string, maxBytes: number): string {
  const bytes = encoder.encode(text)
  if (bytes.length <= maxBytes) return text
  return decoder.decode(bytes.slice(0, maxBytes))
}
