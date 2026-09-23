// Forme commune d'une fonction du catalogue (E04-S04). Fichier à part du catalogue : table.ts et
// simulated.ts en ont besoin, et registry.ts les importe ; sans lui, l'import serait circulaire.
import type * as z from "zod/v4"

import type { ProtoDb } from "../db"
import type { Identity } from "../identity"

/** read : lecture ; write : écriture ; sensitive : envoie, supprime ou paie → confirmation en deux temps. */
export type FunctionClass = "read" | "write" | "sensitive"

export type FunctionContext = { db: ProtoDb; identity: Identity }

export type FunctionOutput = { text: string; teamId?: string | null }

export type ProtoFunction = {
  name: string
  connector: string
  class: FunctionClass
  /** Anglais, première phrase = ce qu'elle fait. */
  description: string
  schema: z.ZodObject
  examples: Record<string, unknown>[]
  refusals: string[]
  run: (ctx: FunctionContext, args: never) => Promise<FunctionOutput>
  /** Fonctions sensibles : récapitulatif nominatif montré avant l'accord, sans rien exécuter. */
  summarize?: (ctx: FunctionContext, args: never) => Promise<string>
}

/**
 * Fonction typée par son schéma, effacée au type commun du catalogue. Les schémas sont des
 * `z.strictObject` : une clé inconnue (« filters » pour « filter ») est refusée au lieu d'être ignorée.
 */
export function defineFunction<S extends z.ZodObject>(fn: {
  name: string
  connector: string
  class: FunctionClass
  description: string
  schema: S
  examples: z.input<S>[]
  refusals: string[]
  run: (ctx: FunctionContext, args: z.infer<S>) => Promise<FunctionOutput>
  summarize?: (ctx: FunctionContext, args: z.infer<S>) => Promise<string>
}): ProtoFunction {
  return fn as unknown as ProtoFunction
}
