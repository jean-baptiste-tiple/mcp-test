// Catalogue des fonctions derrière <prefix>_call (E04-S04 ; doc fonctionnel, « Connecteurs »). Sans
// lui, call n'a rien à exécuter, read aucun contrat à servir, find aucune fonction à trouver.
import * as z from "zod/v4"

import type { ProtoFunction } from "./define"
import { SIMULATED_FUNCTIONS } from "./simulated"
import { TABLE_FUNCTIONS } from "./table"

export const FUNCTIONS: ProtoFunction[] = [...TABLE_FUNCTIONS, ...SIMULATED_FUNCTIONS]

const BY_NAME = new Map(FUNCTIONS.map((fn) => [fn.name, fn]))

export function getFunction(name: string): ProtoFunction | null {
  return BY_NAME.get(name.trim()) ?? null
}

/** Nom de fonction (`sellsy.list_estimates`) plutôt que chemin de nœud (`ventes/relance_devis`). */
export function looksLikeFunction(path: string): boolean {
  return /^[a-z]+\.[a-z_]+$/.test(path.trim())
}

/** Contrat servi par <prefix>_read : ce que le modèle doit savoir pour appeler juste. */
export function describeFunction(fn: ProtoFunction, prefix: string): string {
  const schema = z.toJSONSchema(fn.schema) as Record<string, unknown>
  delete schema.$schema
  return [
    `Function ${fn.name} (connector ${fn.connector}, class ${fn.class}${fn.class === "sensitive" ? ": two-step confirmation" : ""})`,
    fn.description,
    "Arguments (JSON Schema):",
    JSON.stringify(schema),
    "Examples:",
    ...fn.examples.map((args) => `${prefix}_call {"function": "${fn.name}", "arguments": ${JSON.stringify(args)}}`),
    "Possible refusals:",
    ...fn.refusals.map((r) => `- ${r}`),
  ].join("\n")
}

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

/** Recherche lexicale dans le catalogue (nom, connecteur, description) : part des mots de la requête trouvés. */
export function searchFunctions(query: string, limit: number): { fn: ProtoFunction; score: number }[] {
  const wanted = [...new Set(words(query))]
  if (wanted.length === 0) return []
  return FUNCTIONS.map((fn) => {
    const haystack = words(`${fn.name} ${fn.connector} ${fn.description}`)
    const hits = wanted.filter((w) => haystack.some((h) => h === w || (w.length > 3 && (h.startsWith(w) || w.startsWith(h)))))
    return { fn, score: hits.length / wanted.length }
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.fn.name.localeCompare(b.fn.name))
    .slice(0, limit)
}
