// Accès aux 3 tables du banc. Sans cette frontière, la route et les tests parleraient
// directement à Supabase : les tests exigeraient une base, et l'AC « repository mémoire »
// (story E01-S02) serait intestable.
//
// Le client Supabase est INJECTÉ (pas importé) : `@/lib/supabase/admin` charge
// `server-only`, qui jette à l'import hors contexte serveur — les tests unit ne pourraient
// plus importer le repository mémoire (repository.memory.ts) depuis ce fichier. La route fait
// `new SupabaseBenchRepository(getAdminClient())`.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database, Json } from "@/types/database"

import { README_TOOL_NAMES } from "./levers"

export type BenchScenarioRow = Database["public"]["Tables"]["bench_scenarios"]["Row"]
export type BenchToolRow = Database["public"]["Tables"]["bench_tools"]["Row"]
export type BenchEventInsert = Database["public"]["Tables"]["bench_events"]["Insert"]

/** Empreinte d'un host : en stateless (ADR-001) c'est le seul lien entre deux requêtes. */
export type BenchFingerprint = {
  userAgent: string | null
  ip: string | null
}

/** Champs qu'une mutation de tool peut poser ; absent = inchangé (`update_tool`). */
export type BenchToolWrite = {
  scenarioId: string
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface BenchRepository {
  /** Le scénario `is_active` (index unique partiel : au plus un), ou null. */
  getActiveScenario(): Promise<BenchScenarioRow | null>
  /** TOUTES les lignes du scénario : le filtre `enabled` et le tri sont à loadSnapshot(). */
  listTools(scenarioId: string): Promise<BenchToolRow[]>
  insertEvents(events: BenchEventInsert[]): Promise<void>
  /** `handler = echo`, `enabled = true`, `sort_order` = max + 10. null = nom déjà pris. */
  createTool(input: BenchToolWrite): Promise<BenchToolRow | null>
  /** Champs fournis + `version + 1`. null = aucune ligne de ce nom dans le scénario. */
  updateTool(input: BenchToolWrite): Promise<BenchToolRow | null>
  setToolEnabled(scenarioId: string, name: string, enabled: boolean): Promise<BenchToolRow | null>
  setInstructions(scenarioId: string, instructions: string): Promise<void>
  /** Retourne la nouvelle version servie (`1.0.N` → `1.0.N+1`). */
  bumpServerVersion(scenarioId: string, currentVersion: string): Promise<string>
  /** Levier `gate` : un `tools/call` readme de cette empreinte depuis `since` ? */
  hasRecentReadmeCall(fingerprint: BenchFingerprint, since: Date): Promise<boolean>
}

// Message remonté à l'appelant : ni `error.message` PostgREST ni nom de table — un
// endpoint public ne décrit pas son schéma (security-patterns §Error Handling). Le détail
// technique va dans les logs serveur, juste avant le throw.
const UNAVAILABLE = "Bench registry unavailable"

/** Violation de la contrainte `unique (scenario_id, name)` — pas une panne, un nom pris. */
const PG_UNIQUE_VIOLATION = "23505"

/** Écart entre deux `sort_order` : laisse de la place pour insérer à la main en Studio. */
export const SORT_ORDER_STEP = 10

/**
 * `1.0.N` → `1.0.N+1`. Toute autre forme reçoit un suffixe `.1` : la version servie est une
 * DONNÉE de scénario (un test peut y mettre `beta`), pas un semver garanti par le code.
 */
export function nextServerVersion(current: string): string {
  const match = /^(\d+\.\d+\.)(\d+)$/.exec(current)
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${current}.1`
}

// `updated_at` n'est maintenu par AUCUN trigger (migration S02) : chaque update le pose.
export function touch(): string {
  return new Date().toISOString()
}

/**
 * Implémentation réelle. Chaque méthode JETTE sur erreur Supabase : une base injoignable
 * doit faire échouer la requête MCP bruyamment (mesure faussée sinon), et `logEvents()`
 * a besoin d'un rejet pour attraper l'échec du journal.
 */
export class SupabaseBenchRepository implements BenchRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getActiveScenario(): Promise<BenchScenarioRow | null> {
    const { data, error } = await this.client
      .from("bench_scenarios")
      .select("*")
      .eq("is_active", true)
      .maybeSingle()

    if (error) {
      console.error("[bench] bench_scenarios", error)
      throw new Error(UNAVAILABLE)
    }
    return data
  }

  async listTools(scenarioId: string): Promise<BenchToolRow[]> {
    const { data, error } = await this.client
      .from("bench_tools")
      .select("*")
      .eq("scenario_id", scenarioId)

    if (error) {
      console.error("[bench] bench_tools", error)
      throw new Error(UNAVAILABLE)
    }
    return data ?? []
  }

  async insertEvents(events: BenchEventInsert[]): Promise<void> {
    const { error } = await this.client.from("bench_events").insert(events)
    if (error) {
      console.error("[bench] bench_events", error)
      throw new Error(UNAVAILABLE)
    }
  }

  async createTool(input: BenchToolWrite): Promise<BenchToolRow | null> {
    const rows = await this.listTools(input.scenarioId)
    if (rows.some((row) => row.name === input.name)) return null

    const sortOrder =
      rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + SORT_ORDER_STEP

    const { data, error } = await this.client
      .from("bench_tools")
      .insert({
        scenario_id: input.scenarioId,
        name: input.name,
        title: input.title ?? null,
        description: input.description ?? "",
        ...(input.inputSchema !== undefined ? { input_schema: input.inputSchema as Json } : {}),
        handler: "echo",
        enabled: true,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      // Course entre le listTools ci-dessus et l'insert : le nom vient d'être pris.
      if (error.code === PG_UNIQUE_VIOLATION) return null
      console.error("[bench] createTool", error)
      throw new Error(UNAVAILABLE)
    }
    return data
  }

  async updateTool(input: BenchToolWrite): Promise<BenchToolRow | null> {
    const current = await this.findTool(input.scenarioId, input.name)
    if (!current) return null

    const { data, error } = await this.client
      .from("bench_tools")
      .update({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.inputSchema !== undefined ? { input_schema: input.inputSchema as Json } : {}),
        version: current.version + 1,
        updated_at: touch(),
      })
      .eq("id", current.id)
      .select()
      .single()

    if (error) {
      console.error("[bench] updateTool", error)
      throw new Error(UNAVAILABLE)
    }
    return data
  }

  async setToolEnabled(
    scenarioId: string,
    name: string,
    enabled: boolean
  ): Promise<BenchToolRow | null> {
    const current = await this.findTool(scenarioId, name)
    if (!current) return null

    const { data, error } = await this.client
      .from("bench_tools")
      .update({ enabled, updated_at: touch() })
      .eq("id", current.id)
      .select()
      .single()

    if (error) {
      console.error("[bench] setToolEnabled", error)
      throw new Error(UNAVAILABLE)
    }
    return data
  }

  async setInstructions(scenarioId: string, instructions: string): Promise<void> {
    const { error } = await this.client
      .from("bench_scenarios")
      .update({ instructions, updated_at: touch() })
      .eq("id", scenarioId)

    if (error) {
      console.error("[bench] setInstructions", error)
      throw new Error(UNAVAILABLE)
    }
  }

  async bumpServerVersion(scenarioId: string, currentVersion: string): Promise<string> {
    const next = nextServerVersion(currentVersion)

    const { error } = await this.client
      .from("bench_scenarios")
      .update({ server_version: next, updated_at: touch() })
      .eq("id", scenarioId)

    if (error) {
      console.error("[bench] bumpServerVersion", error)
      throw new Error(UNAVAILABLE)
    }
    return next
  }

  async hasRecentReadmeCall(fingerprint: BenchFingerprint, since: Date): Promise<boolean> {
    let query = this.client
      .from("bench_events")
      .select("id")
      .eq("method", "tools/call")
      .in("tool_name", [...README_TOOL_NAMES])
      .gte("ts", since.toISOString())
      .limit(1)

    // `.eq(col, null)` ne matche JAMAIS en PostgREST : une empreinte partiellement nulle
    // (client sans user-agent, appel local sans x-forwarded-for) doit rester interrogeable.
    query =
      fingerprint.userAgent === null
        ? query.is("user_agent", null)
        : query.eq("user_agent", fingerprint.userAgent)
    query = fingerprint.ip === null ? query.is("ip", null) : query.eq("ip", fingerprint.ip)

    const { data, error } = await query
    if (error) {
      console.error("[bench] hasRecentReadmeCall", error)
      throw new Error(UNAVAILABLE)
    }
    return (data ?? []).length > 0
  }

  private async findTool(scenarioId: string, name: string): Promise<BenchToolRow | null> {
    const { data, error } = await this.client
      .from("bench_tools")
      .select("*")
      .eq("scenario_id", scenarioId)
      .eq("name", name)
      .maybeSingle()

    if (error) {
      console.error("[bench] findTool", error)
      throw new Error(UNAVAILABLE)
    }
    return data
  }
}
