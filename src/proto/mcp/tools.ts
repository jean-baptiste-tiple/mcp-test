// Les six outils du serveur proto, calculés par organisation (architecture §9.4) : le préfixe
// (`acme_`, `delta_`) et le nom du client entrent dans les noms et les descriptions, le reste est
// figé. Sans ce module, les noms seraient écrits en dur et deux clients branchés dans le même host
// exposeraient les mêmes six noms.
//
// Règles mesurées en E01 (mcp-patterns §2.1, §3) : descriptions en anglais, < 1 000 caractères,
// l'essentiel dans la première phrase ; un prérequis en consigne impérative dans cette phrase.
import { inputSchemas, TOOL_KEYS, toInputSchema, type ToolKey } from "../schemas"

export type ToolOrg = { prefix: string; name: string; domains: string | null }

export type ToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean }
}

/** Première phrase des cinq outils autres que context (preuve 8). */
export function prerequisite(prefix: string): string {
  return `Requires the ctx code from ${prefix}_context; call it first.`
}

/** Une phrase, qui renvoie à context : claude.ai ne montre jamais les instructions (E01). */
export function serverInstructions(org: ToolOrg): string {
  return `${org.name} workspace: call ${org.prefix}_context first in every conversation, with the user's request as phrase, because every other ${org.prefix}_ tool requires the ctx code it returns.`
}

function descriptions(org: ToolOrg): Record<ToolKey, string> {
  const p = org.prefix
  const req = prerequisite(p)
  const scope = org.domains ? `Loads your work context at ${org.name} (${org.domains})` : `Loads your work context at ${org.name}`
  return {
    context: `${scope} and routes the user's request to the right procedure; call it first in every conversation, before any other ${p}_ tool. Pass phrase = the user's request, verbatim. Returns the ctx code every other ${p}_ tool requires, the steps of the matching procedure when the match is clear, who you work for, the organisation's rules, what's new, and the useful procedures and documents. If it returns candidates instead of steps, ask the user which one they mean. If a tool later answers "context has changed", call ${p}_context again.`,
    find: `${req} Searches procedures, pages, tables and connector functions by their words and returns three candidates with a score. Use this when ${p}_context matched no procedure, or to locate a page, a table or a function. Do not use to read content (use ${p}_read).`,
    read: `${req} Reads a page, a procedure or a table by its path (e.g. ventes/relance_devis), or the contract of a function (e.g. sellsy.list_estimates). A long page comes as an outline: then read one section by its title. since_revision returns only what changed. Do not use to run a function (use ${p}_call).`,
    call: `${req} Runs a connector function (tables, sellsy, mail, slack…) with arguments checked against its contract; read the contract with ${p}_read if unsure. A sensitive function (sending, deleting) first returns a summary: show it to the user, get their explicit approval, then call again with confirm: true. Never set confirm without that approval.`,
    write: `${req} Creates or edits a page or a procedure by operations on sections addressed by their title, saved as a draft; publish: true makes it live. Pass base_revision = the revision you read: a stale revision is refused with the current state. ops items: {op: replace_section | append | add_section | delete_section | replace_text, section: "<title>", text, find (replace_text), after (add_section)}.`,
    feedback: `${req} Reports a friction, a missing capability or a tool error to the ${org.name} platform team and returns a ticket number. Use this when a tool, a procedure or an instruction was unclear, missing or wrong.`,
  }
}

const TITLES: Record<ToolKey, string> = {
  context: "Load work context",
  find: "Find",
  read: "Read",
  call: "Run a function",
  write: "Write a page",
  feedback: "Report a problem",
}

const READ_ONLY: Record<ToolKey, boolean> = {
  context: false, // émet un code ctx (une ligne en base)
  find: true,
  read: true,
  call: false,
  write: false,
  feedback: false,
}

export function buildTools(org: ToolOrg): ToolDefinition[] {
  const schemas = inputSchemas(org.prefix)
  const text = descriptions(org)
  return TOOL_KEYS.map((key) => ({
    name: `${org.prefix}_${key}`,
    title: `${org.name}: ${TITLES[key]}`,
    description: text[key],
    inputSchema: toInputSchema(schemas[key]),
    annotations: {
      readOnlyHint: READ_ONLY[key],
      ...(key === "call" ? { destructiveHint: true } : {}),
      openWorldHint: false,
    },
  }))
}

/** `acme_find` → `find` ; tout autre nom → null. */
export function toolKey(prefix: string, name: string): ToolKey | null {
  const key = name.startsWith(`${prefix}_`) ? name.slice(prefix.length + 1) : null
  return (TOOL_KEYS as readonly string[]).includes(key ?? "") ? (key as ToolKey) : null
}
