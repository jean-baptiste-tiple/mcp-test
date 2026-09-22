// Types d'accompagnement de probes.mjs. Sans eux, `tsc --noEmit` infère `any` sur PROBES et
// tests/unit/bench-catalogue.test.ts tombe en TS7006 sous `strict`. Déclaration seule, pas de
// runtime : les deux modules restent des .mjs exécutables par `node` sans build.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

/** Check `handler` de bench_tools (migration 20260922082138_bench.sql). */
export type BenchHandler = "echo" | "whoami" | "mutate" | "readme"

export type ReadmeLever = "none" | "instructions" | "descriptions" | "name_first" | "gate" | "ack" | "hub"

/** Colonnes de `bench_tools` écrites par le seed (`version` appartient à la ligne, pas à la copie). */
export interface BenchTool {
  name: string
  title: string
  description: string
  input_schema: JsonObject
  annotations: JsonObject
  handler: BenchHandler
  sort_order: number
}

/** Colonnes de `bench_scenarios` écrites par le seed — `is_active` en est volontairement absent. */
export interface BenchScenarioFields {
  slug: string
  notes: string
  server_name: string
  server_title: string
  server_version: string
  instructions: string
  readme_content: string | null
  readme_lever: ReadmeLever
  ack_ttl_seconds: number | null
}

export declare function deepFreeze<T>(value: T): T

export declare const PROBES: readonly BenchTool[]

export declare const BASELINE: BenchScenarioFields
