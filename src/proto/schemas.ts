// Entrées des six outils du serveur proto (architecture §9.4) : une seule source pour la validation
// (parse dans l'adaptateur) et pour l'inputSchema servi aux hosts (z.toJSONSchema). Zod 4 par
// `zod/v4` (paquet zod 3.25) : Zod 3 n'a pas de toJSONSchema, et écrire les JSON Schema à la main
// en ferait une seconde source qui diverge.
//
// Schémas PLATS (doc fonctionnel, « Les six outils ») : ChatGPT ne montre pas au modèle les
// descriptions imbriquées. Seuls `write.ops` et `call.arguments` sont des objets, et leur forme
// est répétée dans la description de l'outil.
import * as z from "zod/v4"

export const TOOL_KEYS = ["context", "find", "read", "call", "write", "feedback"] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

export const WRITE_OPS = ["replace_section", "append", "add_section", "delete_section", "replace_text"] as const

function ctxField(prefix: string) {
  return z
    .string()
    .describe(`ctx code returned by ${prefix}_context, e.g. 7K3Q-M2XA. Required: call ${prefix}_context first.`)
}

export function inputSchemas(prefix: string) {
  const ctx = ctxField(prefix)
  return {
    context: z.object({
      phrase: z
        .string()
        .max(2000)
        .optional()
        .describe("The user's request, verbatim and in their language. Omit only when there is no request yet."),
    }),
    find: z.object({
      ctx,
      query: z.string().min(1).max(500).describe("Words to search for, e.g. \"relance devis\" or \"grille tarifaire\""),
      type: z
        .enum(["procedure", "page", "table", "function"])
        .optional()
        .describe("Restrict to one kind of result (default: all kinds)"),
    }),
    read: z.object({
      ctx,
      path: z
        .string()
        .min(1)
        .max(200)
        .describe("Path of a page, procedure or table (e.g. ventes/relance_devis), or a function name (e.g. sellsy.list_estimates)"),
      section: z.string().max(200).optional().describe("Title of one section to read (default: the whole page, or its outline if long)"),
      outline: z.boolean().optional().describe("true: only the list of section titles with their sizes (default false)"),
      since_revision: z.number().int().min(0).optional().describe("Only the sections changed after this revision"),
      draft: z.boolean().optional().describe("true: read the pending draft instead of the published revision (default false)"),
    }),
    call: z.object({
      ctx,
      function: z.string().min(1).max(100).describe("Function name, e.g. sellsy.list_estimates or table.rows"),
      arguments: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(`Arguments of the function, as its contract says (read it with ${prefix}_read, path = the function name). Default {}`),
      confirm: z
        .boolean()
        .optional()
        .describe("true only after the user explicitly approved the summary returned by a first call of a sensitive function"),
    }),
    write: z.object({
      ctx,
      path: z.string().min(1).max(200).describe("Path of the page or procedure to create or edit, e.g. conseil/cr_client_2026_09"),
      base_revision: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Revision you read; required to edit an existing page (a stale one is refused)"),
      title: z.string().max(200).optional().describe("Title (required to create)"),
      summary: z.string().max(200).optional().describe("One-line summary, 200 characters max (required to create)"),
      kind: z.enum(["page", "procedure"]).optional().describe("Kind of a new node (default page)"),
      ops: z
        .array(
          z.object({
            op: z.enum(WRITE_OPS).describe("Operation"),
            section: z.string().describe("Title of the section it applies to"),
            text: z.string().optional().describe("New text"),
            find: z.string().optional().describe("replace_text: exact words to replace inside the section"),
            after: z.string().optional().describe("add_section: title of the section to insert after (default: at the end)"),
          })
        )
        .optional()
        .describe("Operations on sections addressed by title"),
      triggers: z.array(z.string().max(300)).optional().describe("Procedure only: phrases that should lead to it"),
      neighbors: z.array(z.string().max(300)).optional().describe("Procedure only: close phrases that must NOT lead to it"),
      publish: z.boolean().optional().describe("true: publish the draft after applying ops (default false: draft only)"),
    }),
    feedback: z.object({
      ctx,
      type: z.enum(["friction", "gap", "error"]).describe("friction: unclear or slow; gap: missing capability; error: a tool failed"),
      text: z.string().min(1).max(4000).describe("What happened, what you expected, and the tool call involved"),
    }),
  } satisfies Record<ToolKey, z.ZodObject>
}

export type InputSchemas = ReturnType<typeof inputSchemas>
export type ToolInput<K extends ToolKey> = z.infer<InputSchemas[K]>

/** JSON Schema servi dans tools/list, sans la clé `$schema` que les hosts n'utilisent pas. */
export function toInputSchema(schema: z.ZodObject): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema
  return json
}

/** Lecture des arguments ; les problèmes sont rendus au modèle, chemin par chemin. */
export function parseInput<S extends z.ZodObject>(schema: S, args: unknown): { data: z.infer<S> } | { issues: string } {
  const result = schema.safeParse(args)
  if (result.success) return { data: result.data }
  return {
    issues: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
  }
}
