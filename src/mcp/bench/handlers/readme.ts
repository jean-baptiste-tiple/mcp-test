// Handler `readme` : sert le readme du scénario et l'ack qui prouve qu'il a été lu. Sans ce
// tool, les leviers `ack` et `gate` n'ont rien à ouvrir et la question « un host lit-il un
// document avant d'agir ? » n'est pas mesurable.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { toToolResult } from "@/mcp/tool-result"

import { getAckSecret, makeAck } from "../ack"
import type { BenchToolContext } from "../context"
import { leverOf } from "../levers"
import type { BenchSnapshot } from "../snapshot"

const NO_README = "No readme configured for this scenario."

export function readmeHandler(
  _args: Record<string, unknown>,
  ctx: BenchToolContext,
  snapshot: BenchSnapshot
): CallToolResult {
  const scenario = snapshot.scenario
  const content = scenario?.readme_content ?? null

  const ack = makeAck({
    secret: getAckSecret(),
    // Aucun scénario actif : l'ack reste calculable (et invérifiable ailleurs), le tool ne
    // doit pas tomber en erreur — un banc muet est plus trompeur qu'un banc vide.
    scenarioId: scenario?.id ?? "",
    readmeContent: content,
    ttlSeconds: scenario?.ack_ttl_seconds ?? null,
    now: ctx.now(),
  })

  // La ligne `ack: <code>` est en TEXTE : c'est la seule voie fiable vers le modèle
  // (mcp-patterns §4), et c'est elle que le readme lui demande de recopier.
  return toToolResult({
    text: `${content ?? NO_README}\n\nack: ${ack}`,
    structured: { ack, lever: leverOf(snapshot), ttl_seconds: scenario?.ack_ttl_seconds ?? null },
  })
}
