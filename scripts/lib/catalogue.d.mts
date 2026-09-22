// Types d'accompagnement de catalogue.mjs. Sans eux, `tsc --noEmit` infère `any` sur `tools` (le
// module est du JS non annoté) et tests/unit/bench-catalogue.test.ts tombe en TS7006 sous `strict`.
// Les types de base vivent dans probes.d.mts, comme le module dont catalogue.mjs dépend.

import type { BenchScenarioFields, BenchTool } from "./probes.mjs"

export type { JsonObject, JsonValue } from "./probes.mjs"

/** Position d'un canari : trois par texte long, un seul (`only`) dans un texte court. */
export type CanaryPosition = "start" | "middle" | "end" | "only"

/** Générateur pseudo-aléatoire : même contrat que `Math.random`, mais seedé. */
export type Rng = () => number

export interface BenchScenario extends BenchScenarioFields {
  /** Tools GÉNÉRÉS uniquement : les sondes sont ajoutées par le seed depuis probes.mjs. */
  tools: BenchTool[]
}

export declare function canary(slug: string, field: string, pos: CanaryPosition, rng: Rng): string

export declare function fillText(params: {
  slug: string
  field: string
  targetChars: number
  rng: Rng
}): string

export declare function buildCatalogue(): BenchScenario[]
