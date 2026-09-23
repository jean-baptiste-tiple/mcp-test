// Lecture de `.env.local` hors Next (scripts proto et tests d'intégration proto). Sans elle, chaque
// script et le helper de test recopieraient ce parseur (bench-seed.mjs en garde sa propre copie).
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** Variables de `.env.local` à la racine du dépôt, surchargées par `process.env`. Jamais affichées. */
export function readEnv() {
  const path = fileURLToPath(new URL("../../.env.local", import.meta.url))
  const values = {}
  if (existsSync(path)) {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim()
      if (line === "" || line.startsWith("#")) continue
      const separator = line.indexOf("=")
      if (separator === -1) continue
      const value = line.slice(separator + 1).trim()
      const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
      values[line.slice(0, separator).trim()] = quoted ? value.slice(1, -1) : value
    }
  }
  return { ...values, ...process.env }
}
