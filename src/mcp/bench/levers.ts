// Ce que le host VOIT : lignes `bench_tools` → `tools/list`, et instructions servies, après
// application du levier readme du scénario (architecture §6). C'est l'objet mesuré.
//
// La transformation lignes → `Tool[]` vivait dans registry.ts en S02 ; elle migre ici parce
// que `applyLever` en est la suite immédiate et que registry.ts importe les handlers, dont
// `bench_whoami`, qui a besoin du levier : la laisser là-bas créerait un cycle
// registry → handlers → levers → registry.
import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"

import { isRecord } from "@/lib/utils/is-record"

import type { BenchToolRow } from "./repository"
import type { BenchSnapshot } from "./snapshot"

/** Valeurs autorisées par le check de `bench_scenarios.readme_lever`. */
const README_LEVERS = [
  "none",
  "instructions",
  "descriptions",
  "name_first",
  "gate",
  "ack",
  "hub",
] as const

export type ReadmeLever = (typeof README_LEVERS)[number]

// Textes EXACTS d'architecture §6 : ce sont des données de mesure, pas de la copie libre.
const INSTRUCTIONS_PREFIX =
  "ALWAYS call bench_readme before any other tool of this server, once per conversation."
const DESCRIPTION_PREFIX =
  "Requires bench_readme first (call it once per conversation before this tool)."

/** Nom du tool readme sous le levier `name_first` (et sous lequel le dispatch le reconnaît). */
export const README_FIRST_NAME = "bench_00_readme"

/** Noms possibles du tool readme dans le journal — le gate interroge les deux. */
export const README_TOOL_NAMES = ["bench_readme", README_FIRST_NAME] as const

/** Propriété ajoutée par le levier `ack` à chaque tool non-readme. */
const ACK_PROPERTY = {
  type: "string",
  description: "Value returned by bench_readme; call it first",
} as const

/** La colonne est un `text` libre : une valeur hors check (migration future, écriture
 * manuelle en Studio) ne doit pas changer la surface servie — elle retombe sur `none`. */
export function leverOf(snapshot: BenchSnapshot): ReadmeLever {
  const value = snapshot.scenario?.readme_lever ?? "none"
  return (README_LEVERS as readonly string[]).includes(value) ? (value as ReadmeLever) : "none"
}

export function requiresAck(lever: ReadmeLever): boolean {
  return lever === "ack"
}

export function requiresGate(lever: ReadmeLever): boolean {
  return lever === "gate"
}

function isReadmeRow(row: BenchToolRow): boolean {
  return row.handler === "readme"
}

/** Nom SERVI d'une ligne : seul `name_first` le change (renommage du tool readme). */
export function servedName(row: BenchToolRow, lever: ReadmeLever): string {
  return lever === "name_first" && isReadmeRow(row) ? README_FIRST_NAME : row.name
}

/**
 * Lignes dans l'ORDRE servi. `bench_whoami` en a besoin pour annoncer `name@version` :
 * `Tool` ne porte pas la colonne `version`.
 */
export function servedRows(snapshot: BenchSnapshot): BenchToolRow[] {
  if (leverOf(snapshot) !== "name_first") return [...snapshot.tools]

  const index = snapshot.tools.findIndex(isReadmeRow)
  if (index <= 0) return [...snapshot.tools]
  return [
    snapshot.tools[index],
    ...snapshot.tools.slice(0, index),
    ...snapshot.tools.slice(index + 1),
  ]
}

/**
 * Lignes → `tools/list`. Le JSON Schema de la colonne `input_schema` est servi TEL QUEL
 * (aucune génération depuis Zod) : sa forme exacte est une variable de test. Pas de `_meta`
 * — ni widget ni securitySchemes en phase 1 (ADR-002 §4).
 */
function toTool(row: BenchToolRow): Tool {
  return {
    name: row.name,
    ...(row.title !== null ? { title: row.title } : {}),
    description: row.description,
    // `as` documenté : la colonne est un jsonb libre, le serveur ne la valide pas — servir
    // un schéma invalide fait partie des scénarios mesurables.
    inputSchema: row.input_schema as Tool["inputSchema"],
    ...(row.annotations !== null ? { annotations: row.annotations as ToolAnnotations } : {}),
  }
}

/** Ajoute `ack` aux `properties` ET aux `required`, sans toucher au reste du schéma servi. */
function withAckProperty(schema: Tool["inputSchema"]): Tool["inputSchema"] {
  // Un scénario peut servir un `input_schema` qui n'est pas un objet : on le laisse tel quel
  // plutôt que de fabriquer un schéma que la ligne ne décrit pas.
  if (!isRecord(schema)) return schema

  const properties = isRecord(schema.properties) ? { ...schema.properties } : {}
  properties.ack = { ...ACK_PROPERTY }

  const previous = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === "string" && field !== "ack")
    : []

  // `type` n'est PAS forcé : un schéma sans `type`, ou avec un `type` erroné, est un scénario
  // mesurable — le levier ne doit pas réparer en douce ce que la ligne sert.
  return { ...schema, properties, required: [...previous, "ack"] }
}

function applyToTool(tool: Tool, row: BenchToolRow, lever: ReadmeLever): Tool {
  if (isReadmeRow(row)) {
    return lever === "name_first" ? { ...tool, name: README_FIRST_NAME } : tool
  }

  switch (lever) {
    case "descriptions":
      return { ...tool, description: [DESCRIPTION_PREFIX, tool.description].filter(Boolean).join(" ") }
    case "hub":
      return { ...tool, description: `${tool.name}: see bench_readme for usage.` }
    case "ack":
      return { ...tool, inputSchema: withAckProperty(tool.inputSchema) }
    default:
      return tool
  }
}

/**
 * Fonction PURE : le snapshot n'est jamais muté (il est relu à chaque requête, mais les
 * lignes sont partagées avec le journal et avec `bench_whoami` dans la même requête).
 */
export function applyLever(snapshot: BenchSnapshot): { tools: Tool[]; instructions: string } {
  const lever = leverOf(snapshot)

  return {
    tools: servedRows(snapshot).map((row) => applyToTool(toTool(row), row, lever)),
    instructions:
      lever === "instructions"
        ? `${INSTRUCTIONS_PREFIX}\n\n${snapshot.instructions}`
        : snapshot.instructions,
  }
}

/**
 * Ligne visée par un `tools/call`. Sous `name_first` le host appelle le tool readme sous son
 * nom servi (`bench_00_readme`) : sans cette résolution, le levier rendrait le readme
 * inappelable et le scénario ne mesurerait plus rien.
 */
export function resolveToolRow(snapshot: BenchSnapshot, name: string): BenchToolRow | null {
  const direct = snapshot.tools.find((row) => row.name === name)
  if (direct) return direct

  if (name === README_FIRST_NAME && leverOf(snapshot) === "name_first") {
    return snapshot.tools.find(isReadmeRow) ?? null
  }
  return null
}
