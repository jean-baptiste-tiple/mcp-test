// Snapshot = ce que le serveur MCP sert pendant UNE requête. Relu à chaque requête, JAMAIS
// mis en cache (invariant architecture) : « une modification en base est-elle visible à la
// requête suivante ? » est précisément la variable que le banc mesure.
import { FALLBACK_INSTRUCTIONS, FALLBACK_SERVER_INFO } from "@/mcp/config"

import type { BenchRepository, BenchScenarioRow, BenchToolRow } from "./repository"

export type BenchServerInfo = {
  name: string
  title?: string
  version: string
}

export type BenchSnapshot = {
  /** null = aucun scénario actif : le serveur s'annonce mais ne sert aucun tool. */
  scenario: BenchScenarioRow | null
  /** Tools activés, triés par sort_order. */
  tools: BenchToolRow[]
  serverInfo: BenchServerInfo
  instructions: string
}

// Fabrique, pas constante : un snapshot est passé aux handlers d'UNE requête. Un singleton
// partagé entre toutes les requêtes du process se ferait muter par erreur tôt ou tard.
function emptySnapshot(): BenchSnapshot {
  return {
    scenario: null,
    tools: [],
    serverInfo: { ...FALLBACK_SERVER_INFO },
    instructions: FALLBACK_INSTRUCTIONS,
  }
}

export async function loadSnapshot(repo: BenchRepository): Promise<BenchSnapshot> {
  const scenario = await repo.getActiveScenario()
  if (!scenario) return emptySnapshot()

  const rows = await repo.listTools(scenario.id)

  return {
    scenario,
    // Filtre et tri ICI, pas en SQL : un seul chemin de code entre la base et les tests
    // sur MemoryBenchRepository. `name` départage les sort_order égaux (ordre stable).
    tools: rows
      .filter((tool) => tool.enabled)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    serverInfo: {
      name: scenario.server_name,
      ...(scenario.server_title !== null ? { title: scenario.server_title } : {}),
      version: scenario.server_version,
    },
    instructions: scenario.instructions,
  }
}
