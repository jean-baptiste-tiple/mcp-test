// Types d'accompagnement de cc-harness.mjs (tests TypeScript strict).

export declare const MIN_CLI_VERSION: string
export declare const DEFAULT_WRITE_PATTERN: RegExp
export declare const COLUMNS: string[]
/** Réglages passés par `--settings` : écartent les CLAUDE.md personnels du run. */
export declare const ISOLATION_SETTINGS: string

export interface PlanTurn {
  text: string
  /** Commande shell jouée depuis la racine du dépôt avant ce tour (ex. `pnpm proto:set acme rules bump`). */
  before?: string
}

export interface PlanPrompt {
  id: string
  /** Absent : la golden query de même id. `@ID` dans un tour cite une golden query. */
  turns?: (string | PlanTurn)[]
  extraArgs?: string[]
}

export interface Plan {
  name: string
  mcpConfig: string
  goldenQueries?: string
  models: string[]
  trials?: number
  permission: "bypass" | "allowlist"
  allowedTools?: string[]
  timeoutMs?: number
  prompts: PlanPrompt[]
}

export interface Run {
  id: string
  prompt: string
  model: string
  trial: number
  turns: PlanTurn[]
  extraArgs: string[]
}

export interface RunRow {
  run: string
  model: string
  prompt: string
  trial: number | string
  cli: string
  servers: string
  turns: number
  calls: number
  first_call: string
  sequence: string
  tool_errors: number
  before_first_write: number | ""
  confirms: number
  denials: number
  duration_s: number
  tokens_in: number
  tokens_out: number
  cache_read: number
  cache_write: number
  cost_usd: number
  final_match: boolean | ""
  error: boolean
}

export declare function parseCliVersion(output: string): number[] | null
export declare function checkCliVersion(output: string, min?: string): { ok: boolean; message: string }
export declare function resolveClaudeBin(options?: {
  platform?: string
  pathEntries?: string[]
  exists?: (path: string) => boolean
}): string
export declare function parseServerSpecs(specs: string[]): Record<string, string>
export declare function mcpConfig(servers: Record<string, string>): { mcpServers: Record<string, { type: "http"; url: string }> }
export declare function promptsFromGoldenQueries(markdown: string): Record<string, string>
export declare function expandPlan(plan: Plan, golden?: Record<string, string>, filters?: { only?: string[]; models?: string[] }): Run[]
export declare function claudeArgs(options: {
  model: string
  mcpConfigPath: string
  permission: "bypass" | "allowlist"
  allowedTools?: string[]
  extraArgs?: string[]
  resume?: string
}): string[]
export declare function formatCommand(bin: string, args: string[]): string
export declare function analyzeRun(lines: string[], options?: { writePattern?: RegExp; match?: RegExp }): RunRow
export declare function toMarkdown(rows: RunRow[]): string
export declare function toCsv(rows: RunRow[]): string
