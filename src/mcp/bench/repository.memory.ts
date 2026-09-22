// Repository EN MÉMOIRE, utilisé par les tests. Séparé de repository.ts (376 lignes avec
// lui) : l'implémentation Supabase et le double de test n'ont aucune ligne commune et ne
// changent pas pour les mêmes raisons — l'une suit PostgREST, l'autre les besoins des tests.
//
// Il n'est jamais importé par la route : `SupabaseBenchRepository` reste le seul chemin de
// production vers les tables (ADR-002 §3).
import type { Json } from "@/types/database"

import { README_TOOL_NAMES } from "./levers"
import {
  nextServerVersion,
  SORT_ORDER_STEP,
  touch,
  type BenchEventInsert,
  type BenchFingerprint,
  type BenchRepository,
  type BenchScenarioRow,
  type BenchToolRow,
  type BenchToolWrite,
} from "./repository"

/** Repository de test : tableaux en mémoire, mutables entre deux requêtes. */
export class MemoryBenchRepository implements BenchRepository {
  readonly inserted: BenchEventInsert[] = []
  /** Quand elle est posée, insertEvents rejette avec cette erreur (AC « journal en panne »). */
  insertError: Error | null = null

  constructor(
    public scenario: BenchScenarioRow | null = null,
    public tools: BenchToolRow[] = []
  ) {}

  async getActiveScenario(): Promise<BenchScenarioRow | null> {
    return this.scenario
  }

  async listTools(scenarioId: string): Promise<BenchToolRow[]> {
    return this.tools.filter((tool) => tool.scenario_id === scenarioId)
  }

  async insertEvents(events: BenchEventInsert[]): Promise<void> {
    if (this.insertError) throw this.insertError
    this.inserted.push(...events)
  }

  async createTool(input: BenchToolWrite): Promise<BenchToolRow | null> {
    const rows = await this.listTools(input.scenarioId)
    if (rows.some((row) => row.name === input.name)) return null

    const now = touch()
    const row: BenchToolRow = {
      id: `mem-${input.scenarioId}-${input.name}`,
      scenario_id: input.scenarioId,
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? "",
      input_schema: (input.inputSchema ?? { type: "object", properties: {} }) as Json,
      annotations: null,
      handler: "echo",
      enabled: true,
      version: 1,
      sort_order: rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + SORT_ORDER_STEP,
      created_at: now,
      updated_at: now,
    }
    this.tools.push(row)
    return row
  }

  async updateTool(input: BenchToolWrite): Promise<BenchToolRow | null> {
    return this.replaceTool(input.scenarioId, input.name, (current) => ({
      ...current,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.inputSchema !== undefined ? { input_schema: input.inputSchema as Json } : {}),
      version: current.version + 1,
      updated_at: touch(),
    }))
  }

  async setToolEnabled(
    scenarioId: string,
    name: string,
    enabled: boolean
  ): Promise<BenchToolRow | null> {
    return this.replaceTool(scenarioId, name, (current) => ({
      ...current,
      enabled,
      updated_at: touch(),
    }))
  }

  async setInstructions(scenarioId: string, instructions: string): Promise<void> {
    if (this.scenario?.id !== scenarioId) return
    this.scenario = { ...this.scenario, instructions, updated_at: touch() }
  }

  async bumpServerVersion(scenarioId: string, currentVersion: string): Promise<string> {
    const next = nextServerVersion(currentVersion)
    if (this.scenario?.id === scenarioId) {
      this.scenario = { ...this.scenario, server_version: next, updated_at: touch() }
    }
    return next
  }

  async hasRecentReadmeCall(fingerprint: BenchFingerprint, since: Date): Promise<boolean> {
    return this.inserted.some(
      (event) =>
        event.method === "tools/call" &&
        typeof event.tool_name === "string" &&
        (README_TOOL_NAMES as readonly string[]).includes(event.tool_name) &&
        (event.user_agent ?? null) === fingerprint.userAgent &&
        (event.ip ?? null) === fingerprint.ip &&
        // `ts` absent = écrit à l'instant (la colonne a `default now()` en base).
        (event.ts === undefined || new Date(event.ts).getTime() >= since.getTime())
    )
  }

  private replaceTool(
    scenarioId: string,
    name: string,
    change: (current: BenchToolRow) => BenchToolRow
  ): BenchToolRow | null {
    const index = this.tools.findIndex(
      (row) => row.scenario_id === scenarioId && row.name === name
    )
    if (index === -1) return null

    const updated = change(this.tools[index])
    this.tools[index] = updated
    return updated
  }
}
