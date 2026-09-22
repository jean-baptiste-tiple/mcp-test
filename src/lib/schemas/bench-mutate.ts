// Seule mutation réelle du banc, donc seul schéma Zod du projet (ADR-002 §2). Les arguments
// viennent d'un modèle sur un endpoint public : ils sont non fiables, et sans plafonds une
// seule description peut faire grossir `tools/list` jusqu'à la limite de réponse Vercel
// (architecture §7).
import { z } from "zod"

import { byteLength } from "@/lib/utils/byte-size"

const BENCH_MUTATE_ACTIONS = [
  "create_tool",
  "update_tool",
  "disable_tool",
  "enable_tool",
  "set_instructions",
  "bump_version",
] as const

type BenchMutateAction = (typeof BENCH_MUTATE_ACTIONS)[number]

/** Actions qui désignent une ligne `bench_tools` : `name` y est obligatoire. */
const TOOL_ACTIONS: readonly BenchMutateAction[] = [
  "create_tool",
  "update_tool",
  "disable_tool",
  "enable_tool",
]

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/
const MAX_DESCRIPTION_BYTES = 100 * 1024
const MAX_INPUT_SCHEMA_BYTES = 64 * 1024

export const BenchMutateInput = z
  .object({
    action: z
      .enum(BENCH_MUTATE_ACTIONS)
      .describe(
        "What to change: create_tool, update_tool, disable_tool, enable_tool, set_instructions or bump_version."
      ),
    name: z
      .string()
      .regex(TOOL_NAME_PATTERN, "must match ^[a-zA-Z0-9_.-]{1,255}$")
      .optional()
      .describe(
        "Tool name, e.g. bench_probe_1. Required for create_tool, update_tool, disable_tool and enable_tool."
      ),
    title: z
      .string()
      .max(255, "must be at most 255 characters")
      .optional()
      .describe("Human title shown by hosts. Optional, create_tool and update_tool only."),
    description: z
      .string()
      .refine(
        (value) => byteLength(value) <= MAX_DESCRIPTION_BYTES,
        `must be at most ${MAX_DESCRIPTION_BYTES} bytes`
      )
      .optional()
      .describe(
        "Tool description served in tools/list. Optional, create_tool and update_tool only."
      ),
    input_schema: z
      .record(z.unknown())
      .refine(
        (value) => byteLength(JSON.stringify(value)) <= MAX_INPUT_SCHEMA_BYTES,
        `must be at most ${MAX_INPUT_SCHEMA_BYTES} bytes once serialized`
      )
      .optional()
      .describe(
        'JSON Schema object served as-is, e.g. {"type":"object","properties":{}}. Optional, create_tool and update_tool only.'
      ),
    instructions: z
      .string()
      .optional()
      .describe("New server instructions. Required for set_instructions."),
  })
  .superRefine((value, ctx) => {
    if (TOOL_ACTIONS.includes(value.action) && value.name === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: `is required for action ${value.action}`,
      })
    }
    if (value.action === "set_instructions" && value.instructions === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructions"],
        message: "is required for action set_instructions",
      })
    }
  })

export type BenchMutateInputType = z.infer<typeof BenchMutateInput>

/**
 * Rejet Zod → message actionnable (mcp-patterns §4) : le champ fautif et la règle, pour que
 * l'agent corrige sans deviner. Pas de `error.format()` brut, illisible dans un chat.
 */
export function describeMutateIssues(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
    .join(" ; ")

  return `bench_mutate rejected the arguments — ${details}. Fix these fields and call bench_mutate again.`
}
