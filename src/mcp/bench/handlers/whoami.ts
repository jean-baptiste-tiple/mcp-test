// Handler `whoami` : ce que CE host vient de recevoir, dit par le serveur lui-même. Sans lui,
// comparer « ce que l'agent croit voir » et « ce qui a été servi » demande d'aller lire le
// journal en base — impossible depuis la conversation, qui est là où la mesure se fait.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { toToolResult } from "@/mcp/tool-result"

import { sha256Hex } from "../ack"
import type { BenchToolContext } from "../context"
import { applyLever, leverOf, requiresAck, requiresGate, servedName, servedRows } from "../levers"
import type { BenchSnapshot } from "../snapshot"

/** Empreinte courte : assez pour comparer deux réponses, illisible comme contenu. */
function shortSha256(text: string): string {
  return sha256Hex(text).slice(0, 12)
}

/** Aligné sur le `maxLength` du schéma servi : un tag de session, pas un canal de données. */
const MAX_NOTE_CHARS = 200

/** Le schéma est servi tel quel, jamais validé par le serveur : la borne est appliquée ici. */
function noteOf(args: Record<string, unknown>): string | null {
  return typeof args.note === "string" ? args.note.slice(0, MAX_NOTE_CHARS) : null
}

export function whoamiHandler(
  args: Record<string, unknown>,
  ctx: BenchToolContext,
  snapshot: BenchSnapshot
): CallToolResult {
  const lever = leverOf(snapshot)
  const { instructions } = applyLever(snapshot)
  const readme = snapshot.scenario?.readme_content ?? null
  const note = noteOf(args)

  const payload = {
    scenario: snapshot.scenario?.slug ?? null,
    server_version: snapshot.serverInfo.version,
    lever,
    request: {
      user_agent: ctx.fingerprint.userAgent,
      protocol_version: ctx.headers.get("mcp-protocol-version") || null,
      // "none" et pas null : en stateless (ADR-001) l'absence de session est le cas NORMAL,
      // et un agent lit mieux une valeur explicite qu'un champ vide.
      session_id: ctx.headers.get("mcp-session-id") || "none",
    },
    // Le serveur ne peut PAS connaître le modèle derrière le host : le testeur tague sa
    // session au premier appel, et le tag lui est renvoyé pour qu'il le voie appliqué (le
    // journal le capture déjà via `args`). Absent ou non-string = champ absent, pas `null`.
    ...(note !== null ? { note } : {}),
    // `name@version` sur les lignes SERVIES : sous `name_first` le readme est annoncé sous
    // son nom servi, sinon whoami contredirait la liste que le host vient de recevoir.
    tools: servedRows(snapshot).map((row) => `${servedName(row, lever)}@${row.version}`),
    instructions_sha256: shortSha256(instructions),
    readme_sha256: readme === null ? null : shortSha256(readme),
    ack_required: requiresAck(lever),
    next_actions: requiresAck(lever) || requiresGate(lever) ? ["bench_readme"] : [],
  }

  // Les deux formes portent le MÊME objet : l'écart entre ce que le modèle lit (texte) et ce
  // que l'host expose (structuré) ne doit pas venir de nous (mcp-patterns §4).
  return toToolResult({ text: JSON.stringify(payload, null, 2), structured: payload })
}
