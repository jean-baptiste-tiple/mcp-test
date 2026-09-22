// Accès aux 3 tables du banc. Sans cette frontière, la route et les tests parleraient
// directement à Supabase : les tests exigeraient une base, et l'AC « repository mémoire »
// (story E01-S02) serait intestable.
//
// Le client Supabase est INJECTÉ (pas importé) : `@/lib/supabase/admin` charge
// `server-only`, qui jette à l'import hors contexte serveur — les tests unit ne pourraient
// plus importer MemoryBenchRepository depuis ce fichier. La route fait
// `new SupabaseBenchRepository(getAdminClient())`.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

export type BenchScenarioRow = Database["public"]["Tables"]["bench_scenarios"]["Row"]
export type BenchToolRow = Database["public"]["Tables"]["bench_tools"]["Row"]
export type BenchEventInsert = Database["public"]["Tables"]["bench_events"]["Insert"]

export interface BenchRepository {
  /** Le scénario `is_active` (index unique partiel : au plus un), ou null. */
  getActiveScenario(): Promise<BenchScenarioRow | null>
  /** TOUTES les lignes du scénario : le filtre `enabled` et le tri sont à loadSnapshot(). */
  listTools(scenarioId: string): Promise<BenchToolRow[]>
  insertEvents(events: BenchEventInsert[]): Promise<void>
}

// Message remonté à l'appelant : ni `error.message` PostgREST ni nom de table — un
// endpoint public ne décrit pas son schéma (security-patterns §Error Handling). Le détail
// technique va dans les logs serveur, juste avant le throw.
const UNAVAILABLE = "Bench registry unavailable"

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
}

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
}
