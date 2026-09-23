// Texte venu d'un appelant (corps JSON-RPC : méthode, client annoncé, nom d'outil) avant une colonne
// Postgres. Sans lui, un seul caractère NUL ou un surrogate isolé (`\ud800`, légal en JSON) fait refuser par
// Postgres (text comme jsonb) l'INSERT du lot entier : toutes les lignes de journal de la requête sont
// perdues. Et un `.slice()` qui coupe un emoji en deux fabrique lui-même un surrogate isolé : la troncature
// se fait donc ici, à une frontière de code point.
//
// src/mcp/bench/events.ts garde sa propre copie (remplacement par U+FFFD au lieu du retrait), à fusionner un
// jour : le banc n'est pas touché par E03.

/**
 * Au plus `maxChars` caractères (code points, comme `char_length` de Postgres), sans NUL ni surrogate
 * isolé : ils sont retirés, et ne comptent pas. Ne parcourt que le début d'un texte long.
 */
export function sanitizeText(value: string, maxChars: number): string {
  let kept = ""
  let count = 0
  // for…of avance par code point : un couple de surrogates valide (emoji) sort entier, un surrogate isolé seul.
  for (const char of value) {
    if (count >= maxChars) break
    if (char === "\u0000" || isLoneSurrogate(char)) continue
    kept += char
    count += 1
  }
  return kept
}

function isLoneSurrogate(char: string): boolean {
  if (char.length !== 1) return false
  const code = char.charCodeAt(0)
  return code >= 0xd800 && code <= 0xdfff
}
