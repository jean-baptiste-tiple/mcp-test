// <prefix>_find (E04-S02 ; doc fonctionnel, « Les six outils ») : la longue traîne, au-delà de ce que
// context a reconnu. Trois candidats avec score ; sous le seuil de service, une consigne de demander.
// Sans lui, une demande sans procédure n'a aucun chemin vers une page, un tableau ou une fonction.
import type { ProtoDb } from "../db"
import { searchFunctions } from "../functions/registry"
import type { Identity } from "../identity"
import type { ServiceResult } from "../result"
import { formatScore, rankCandidates, SERVE_THRESHOLD } from "./routing"

const FIND_LIMIT = 3

export async function find(
  db: ProtoDb,
  identity: Identity,
  input: { query: string; type?: "procedure" | "page" | "table" | "function" }
): Promise<ServiceResult> {
  const p = identity.org.prefix
  const type = input.type ?? null
  if (type === "function") {
    const functions = searchFunctions(input.query, FIND_LIMIT)
    if (functions.length === 0) {
      return { text: `No function matches « ${input.query} ». Ask the user what they want to do; do not guess.`, target: input.query }
    }
    const lines = [`Top functions for « ${input.query} »:`]
    functions.forEach(({ fn, score }, i) => lines.push(`${i + 1}. ${fn.name} (${fn.class}, score ${formatScore(score)}): ${fn.description.split(". ")[0]}.`))
    lines.push(`Read a contract with ${p}_read {"path": "<function>"}, then run it with ${p}_call.`)
    return { text: lines.join("\n"), target: input.query }
  }

  const candidates = await rankCandidates(db, identity, input.query, type, FIND_LIMIT)
  if (candidates.length === 0) {
    return {
      text: `No match for « ${input.query} ». Ask the user to rephrase or to say what they are looking for; do not guess.`,
      target: input.query,
    }
  }

  const lines = [`Top matches for « ${input.query} »:`]
  candidates.forEach((c, i) => lines.push(`${i + 1}. ${c.path} (${c.kind}, score ${formatScore(c.score)}): ${c.title}. ${c.summary}`))
  lines.push(`Read one with ${p}_read {"path": "<path>"}; a procedure's steps are in its "Étapes" section.`)
  if (candidates[0].score < SERVE_THRESHOLD) lines.push("The best match is weak: ask the user to confirm before acting.")
  return { text: lines.join("\n"), target: input.query }
}
