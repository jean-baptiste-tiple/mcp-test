// Lignes de bench_scenarios / bench_tools pour les tests. Factorisé ici parce que les trois
// fichiers de test du banc ont besoin des MÊMES lignes complètes : sans ça, chaque test
// recopie les 13 colonnes et une colonne ajoutée casse trois fichiers.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { BenchToolContext } from "@/mcp/bench/context"
import { fingerprintFrom } from "@/mcp/bench/events"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"
import type { BenchScenarioRow, BenchToolRow } from "@/mcp/bench/repository"

const SCENARIO_ID = "11111111-1111-1111-1111-111111111111"
const NOW = "2026-01-01T00:00:00Z"

export function makeScenario(overrides: Partial<BenchScenarioRow> = {}): BenchScenarioRow {
  return {
    id: SCENARIO_ID,
    slug: "baseline",
    notes: null,
    server_name: "mcp-bench",
    server_title: "MCP Bench",
    server_version: "1.0.0",
    instructions: "MCP Bench: a test server.",
    readme_content: null,
    readme_lever: "none",
    ack_ttl_seconds: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

/**
 * Contexte d'un `tools/call`. Le McpServer par défaut n'est connecté à AUCUN transport :
 * `sendToolListChanged()` y rejette, ce qui reproduit exactement le cas stateless du banc
 * (ADR-001). Passer un serveur connecté pour tester la branche « envoi réussi ».
 */
export function makeToolContext(overrides: Partial<BenchToolContext> = {}): BenchToolContext {
  const headers = overrides.headers ?? new Headers()

  return {
    repo: new MemoryBenchRepository(),
    server: new McpServer({ name: "mcp-bench", version: "1.0.0" }),
    headers,
    fingerprint: fingerprintFrom(headers),
    now: () => new Date(NOW),
    outcomes: new Map(),
    requestId: "1",
    ...overrides,
  }
}

export function makeTool(overrides: Partial<BenchToolRow> & { name: string }): BenchToolRow {
  return {
    id: `tool-${overrides.name}`,
    scenario_id: SCENARIO_ID,
    title: null,
    description: "",
    input_schema: { type: "object", properties: {} },
    annotations: null,
    handler: "echo",
    enabled: true,
    version: 1,
    sort_order: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}
