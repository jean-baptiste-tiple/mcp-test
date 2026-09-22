// Transformation lignes → surface MCP, et dispatch des appels. Tout ce qui décide de ce
// qu'un host VOIT et de ce qu'il OBTIENT passe ici — c'est l'objet mesuré (ADR-002 §2).
import type { CallToolResult, Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"

import { toolError } from "@/mcp/tool-result"

import { echoHandler } from "./handlers/echo"
import type { BenchSnapshot } from "./snapshot"

export type ToolHandler = (args: Record<string, unknown>) => CallToolResult

/** Valeurs de `bench_tools.handler` implémentées par ce build (le check SQL en autorise 4). */
export type Handler = "echo"

// Point d'extension de S03 (whoami, mutate, readme) : une entrée ici + le type ci-dessus.
const handlers: Record<Handler, ToolHandler> = {
  echo: echoHandler,
}

function isImplementedHandler(value: string): value is Handler {
  // `hasOwn` et pas `in` : la colonne `handler` est une donnée, `"toString"` ne doit pas
  // résoudre vers Object.prototype.
  return Object.hasOwn(handlers, value)
}

/**
 * Lignes → `tools/list`. Le JSON Schema de la colonne `input_schema` est servi TEL QUEL
 * (aucune génération depuis Zod) : sa forme exacte est une variable de test. Pas de `_meta`
 * — ni widget ni securitySchemes en phase 1 (ADR-002 §4).
 */
export function toToolList(snapshot: BenchSnapshot): Tool[] {
  return snapshot.tools.map((row) => ({
    name: row.name,
    ...(row.title !== null ? { title: row.title } : {}),
    description: row.description,
    // `as` documenté : la colonne est un jsonb libre, le serveur ne la valide pas — servir
    // un schéma invalide fait partie des scénarios mesurables.
    inputSchema: row.input_schema as Tool["inputSchema"],
    ...(row.annotations !== null ? { annotations: row.annotations as ToolAnnotations } : {}),
  }))
}

/** `tools/call` : jamais d'exception, toujours un résultat MCP (mcp-patterns §4). */
export function dispatchToolCall(
  snapshot: BenchSnapshot,
  name: string,
  args: Record<string, unknown>
): CallToolResult {
  const row = snapshot.tools.find((tool) => tool.name === name)
  if (!row) {
    // Le cas normal du banc : le host appelle un tool d'un snapshot précédent (pas de
    // session, pas de cache serveur) — on lui dit comment se resynchroniser.
    return toolError(`Unknown tool ${name}. Call tools/list to refresh.`)
  }

  if (!isImplementedHandler(row.handler)) {
    return toolError(
      `Tool ${name} is listed but its handler "${row.handler}" is not implemented on this server. ` +
        `Call tools/list and use another tool.`
    )
  }

  return handlers[row.handler](args)
}
