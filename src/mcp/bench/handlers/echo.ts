// Handler `echo` : renvoie ses arguments tels quels. C'est le handler par défaut des lignes
// `bench_tools` (ADR-002 §2) — il rend n'importe quel tool généré appelable sans code.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { byteLength } from "@/lib/utils/byte-size"
import { MAX_TOOL_ARGS_BYTES } from "@/mcp/config"
import { toToolResult, toolError } from "@/mcp/tool-result"

export function echoHandler(args: Record<string, unknown>): CallToolResult {
  const text = JSON.stringify(args)
  const bytes = byteLength(text)

  if (bytes > MAX_TOOL_ARGS_BYTES) {
    // Erreur actionnable (mcp-patterns §4) : ce qui a été mesuré, la limite, quoi faire.
    return toolError(
      `Arguments too large: ${bytes} bytes serialized, limit is ${MAX_TOOL_ARGS_BYTES}. ` +
        `Retry with shorter argument values.`
    )
  }

  // `content` texte = la sérialisation EXACTE des arguments : c'est ce que le modèle lit et
  // ce que le banc compare à ce qui a été envoyé. `structuredContent` double le canal.
  return toToolResult({ text, structured: { args } })
}
