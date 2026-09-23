// Tableaux derrière <prefix>_call (E04-S04 ; doc fonctionnel, « Tableaux ») : six fonctions, pas
// d'outil à eux. Écriture explicite (set, clear, verified_empty ; null refusé), provenance par
// cellule, garde de révision, file de travail avec bail. Sans elles, le tableau
// ventes/suivi_prospects et ses procédures (relance, qualification) n'ont aucun moyen d'agir.
import * as z from "zod/v4"

import type { Json } from "@/types/proto-database"

import { many, must } from "../db"
import { canRead, canWrite, describeTeam } from "../identity"
import { ProtoError } from "../result"
import { defineFunction, type FunctionContext } from "./define"

type Column = { name: string; type: "text" | "number" | "date" | "enum"; values?: string[] }
type TableMeta = { key: string; state_column: string; states: string[]; columns: Column[] }
type Values = Record<string, unknown>
type Provenance = Record<string, { origin: string; by: string; at: string; reason?: string }>

export const NULL_REFUSED = "null is refused: use clear to empty a field, or verified_empty with a reason for 'searched, nothing found'"
const MAX_ROWS = 50
const MAX_CLAIM = 5
const MAX_LEASE_MINUTES = 60

const tableArg = z.string().min(1).max(200).describe("Table path, e.g. ventes/suivi_prospects")

async function loadTable({ db, identity }: FunctionContext, path: string, mode: "read" | "write") {
  const node = must(
    await db.from("nodes").select("id, path, title, summary, team_id, meta").eq("org_id", identity.org.id).eq("kind", "table").eq("path", path.trim()).maybeSingle(),
    "nodes"
  )
  if (!node || !canRead(identity, node.team_id)) {
    const tables = many(await db.from("nodes").select("path, team_id").eq("org_id", identity.org.id).eq("kind", "table"), "nodes")
      .filter((t) => canRead(identity, t.team_id))
      .map((t) => t.path)
    if (node) throw new ProtoError(`${path} is reserved to ${describeTeam(identity, node.team_id)}. Ask them for access.`)
    throw new ProtoError(`Unknown table ${path}. Tables you can read: ${tables.join(", ") || "none"}.`)
  }
  if (mode === "write" && !canWrite(identity, node.team_id)) {
    throw new ProtoError(`Writing to ${node.path} is reserved to ${describeTeam(identity, node.team_id)}. Ask them for access.`)
  }
  return { node, meta: node.meta as unknown as TableMeta }
}

function column(meta: TableMeta, name: string): Column | undefined {
  return meta.columns.find((c) => c.name === name)
}

/** Raison du refus d'une valeur, ou null si elle convient à la colonne. */
function valueProblem(col: Column, value: unknown): string | null {
  if (value === null) return NULL_REFUSED
  switch (col.type) {
    case "text":
      return typeof value === "string" && value.length <= 2000 ? null : "expected a text of 2,000 characters at most"
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "expected a number (not a string)"
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "expected a date YYYY-MM-DD"
    case "enum":
      return typeof value === "string" && (col.values ?? []).includes(value) ? null : `expected one of: ${(col.values ?? []).join(", ")}`
  }
}

function rowLine(key: string, revision: number, values: Values, columns?: string[], claimedBy?: string | null, leaseUntil?: string | null): string {
  const shown = columns ? Object.fromEntries(columns.filter((c) => c in values).map((c) => [c, values[c]])) : values
  const claim = claimedBy ? `, claimed by ${claimedBy} until ${leaseUntil?.slice(11, 16)} UTC` : ""
  return `- ${key} (rev ${revision}${claim}): ${JSON.stringify(shown)}`
}

// --- table.schema ------------------------------------------------------------------------------------

const schema = defineFunction({
  name: "table.schema",
  connector: "table",
  class: "read",
  description: "Returns a table's columns and types, its key, its state column with the work-queue lifecycle, and how to write to it. Read it before table.write.",
  schema: z.strictObject({ table: tableArg }),
  examples: [{ table: "ventes/suivi_prospects" }],
  refusals: ["unknown table or no read access: the refusal names the owning team and its lead"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "read")
    const [waiting, working] = meta.states
    return {
      teamId: node.team_id,
      text: [
        `Table ${node.path}: ${node.title}. ${node.summary}`,
        `Key: ${meta.key} (each row's key, e.g. P-001; not a column you set).`,
        "Columns:",
        ...meta.columns.map((c) => `- ${c.name}: ${c.type}${c.values ? ` (${c.values.join(" | ")})` : ""}`),
        `State column: ${meta.state_column}. Work queue: table.claim takes rows « ${waiting} » and sets them « ${working} » with a lease; table.release frees a row and sets its final state.`,
        "Write: table.write rows [{key, revision?, set: {column: value}, clear: [column], verified_empty: [{column, reason}]}]. null is refused. Unnamed columns stay unchanged.",
      ].join("\n"),
    }
  },
})

// --- table.rows ------------------------------------------------------------------------------------

const rows = defineFunction({
  name: "table.rows",
  connector: "table",
  class: "read",
  description: "Reads rows of a table, filtered by column values, with a column projection and a cursor; at most 50 rows per call.",
  schema: z.strictObject({
    table: tableArg,
    filter: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe("Exact column values, e.g. {\"statut\": \"à traiter\"}"),
    columns: z.array(z.string()).optional().describe("Columns to return (default: all)"),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe("Rows per page, max 50 (default 20)"),
    cursor: z.string().optional().describe("next_cursor of the previous page"),
  }),
  examples: [{ table: "ventes/suivi_prospects", filter: { statut: "à traiter" }, columns: ["entreprise", "contact", "email"] }],
  refusals: ["unknown column in filter or columns", "unknown table or no read access"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "read")
    const unknown = [...Object.keys(args.filter ?? {}), ...(args.columns ?? [])].filter((c) => !column(meta, c))
    if (unknown.length) throw new ProtoError(`Unknown column(s): ${unknown.join(", ")}. Columns: ${meta.columns.map((c) => c.name).join(", ")}.`)

    const limit = args.limit ?? 20
    let query = ctx.db.from("rows").select("key, values, revision, claimed_by, lease_until", { count: "exact" }).eq("node_id", node.id)
    for (const [col, value] of Object.entries(args.filter ?? {})) query = query.eq(`values->>${col}`, String(value))
    if (args.cursor) query = query.gt("key", args.cursor)
    const result = await query.order("key").limit(limit + 1)
    const found = many(result, "rows")
    const page = found.slice(0, limit)
    const lines = [`${node.path}: ${result.count ?? found.length} row(s) match${args.cursor ? " after the cursor" : ""}.`]
    for (const r of page) lines.push(rowLine(r.key, r.revision, r.values as Values, args.columns, r.claimed_by, r.lease_until))
    if (found.length > limit) lines.push(`next_cursor: ${page[page.length - 1].key}`)
    return { teamId: node.team_id, text: lines.join("\n") }
  },
})

// --- table.aggregate -------------------------------------------------------------------------------

const aggregate = defineFunction({
  name: "table.aggregate",
  connector: "table",
  class: "read",
  description: "Counts a table's rows by the values of one column, with an optional sum of a number column, computed by the server.",
  schema: z.strictObject({
    table: tableArg,
    group_by: z.string().describe("Column to group by, e.g. statut"),
    sum: z.string().optional().describe("Number column to sum per group, e.g. montant_estime"),
  }),
  examples: [{ table: "ventes/suivi_prospects", group_by: "statut", sum: "montant_estime" }],
  refusals: ["unknown column, or sum on a non-number column"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "read")
    if (!column(meta, args.group_by)) throw new ProtoError(`Unknown column ${args.group_by}.`)
    if (args.sum && column(meta, args.sum)?.type !== "number") throw new ProtoError(`sum needs a number column; ${args.sum} is not one.`)
    const all = many(await ctx.db.from("rows").select("values").eq("node_id", node.id).limit(5000), "rows")
    const groups = new Map<string, { count: number; sum: number }>()
    for (const r of all) {
      const values = r.values as Values
      const key = String(values[args.group_by] ?? "(empty)")
      const group = groups.get(key) ?? { count: 0, sum: 0 }
      group.count += 1
      if (args.sum && typeof values[args.sum] === "number") group.sum += values[args.sum] as number
      groups.set(key, group)
    }
    const lines = [`${node.path}: ${all.length} row(s) by ${args.group_by}${args.sum ? `, sum of ${args.sum}` : ""}:`]
    for (const [key, g] of [...groups].sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`- ${key}: ${g.count}${args.sum ? ` (${g.sum})` : ""}`)
    }
    return { teamId: node.team_id, text: lines.join("\n") }
  },
})

// --- table.write -----------------------------------------------------------------------------------

const writeRow = z.strictObject({
  key: z.string().min(1).max(100).describe("Row key, e.g. P-001; a new key creates the row"),
  revision: z.number().int().min(1).optional().describe("Revision you read; a stale one is refused with the current row"),
  set: z.record(z.string(), z.unknown()).optional().describe("Values to set, by column; null is refused"),
  clear: z.array(z.string()).optional().describe("Columns to empty"),
  verified_empty: z
    .array(z.strictObject({ column: z.string(), reason: z.string().min(3).max(500) }))
    .optional()
    .describe("Columns searched without result, with the reason"),
})

type RowChange = { values: Values; provenance: Provenance; changed: string[]; refused: string[] }

/** Applique une ligne d'écriture sur des valeurs existantes ; fonction pure, testée sans base. */
export function applyRowWrite(meta: TableMeta, current: { values: Values; provenance: Provenance }, input: z.infer<typeof writeRow>, by: string, at: string): RowChange {
  const values = { ...current.values }
  const provenance = { ...current.provenance }
  const changed: string[] = []
  const refused: string[] = []

  for (const [name, value] of Object.entries(input.set ?? {})) {
    const col = column(meta, name)
    const problem = !col
      ? "unknown column"
      : name === meta.state_column && value === meta.states[1]
        ? `« ${meta.states[1]} » is set by table.claim, with a lease`
        : valueProblem(col, value)
    if (problem) refused.push(`${name}: ${problem}`)
    else {
      values[name] = value
      provenance[name] = { origin: "agent", by, at }
      changed.push(`set ${name}`)
    }
  }
  for (const name of input.clear ?? []) {
    if (!column(meta, name) || name === meta.state_column) refused.push(`${name}: ${column(meta, name) ? "the state column cannot be cleared" : "unknown column"}`)
    else {
      delete values[name]
      delete provenance[name]
      changed.push(`clear ${name}`)
    }
  }
  for (const { column: name, reason } of input.verified_empty ?? []) {
    if (!column(meta, name) || name === meta.state_column) refused.push(`${name}: ${column(meta, name) ? "the state column cannot be empty" : "unknown column"}`)
    else {
      delete values[name]
      provenance[name] = { origin: "verified_empty", by, at, reason }
      changed.push(`verified_empty ${name}`)
    }
  }
  return { values, provenance, changed, refused }
}

const write = defineFunction({
  name: "table.write",
  connector: "table",
  class: "write",
  description:
    "Writes rows of a table by explicit operations: set values, clear columns, or verified_empty with a reason for 'searched, nothing found'. null is refused; unnamed columns stay unchanged; a stale revision is refused.",
  schema: z.strictObject({ table: tableArg, rows: z.array(writeRow).min(1).max(MAX_ROWS).describe("Rows to write, 50 max") }),
  examples: [
    { table: "ventes/suivi_prospects", rows: [{ key: "P-001", revision: 1, set: { notes: "Rappeler en octobre" }, verified_empty: [{ column: "email", reason: "Aucune adresse sur le site ni dans Sellsy" }] }] },
  ],
  refusals: [NULL_REFUSED, "unknown column, wrong type, state outside the list", "stale revision: the current row is returned", "no write access: names the owning team and its lead"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "write")
    const keys = args.rows.map((r) => r.key)
    const existing = new Map(
      many(await ctx.db.from("rows").select("id, key, values, provenance, revision").eq("node_id", node.id).in("key", keys), "rows").map((r) => [r.key, r])
    )
    const at = new Date().toISOString()
    const by = ctx.identity.user.slug
    const lines: string[] = []

    for (const input of args.rows) {
      const current = existing.get(input.key)
      if (current && input.revision !== undefined && input.revision !== current.revision) {
        lines.push(`${input.key}: refused, stale revision ${input.revision}; current is:\n  ${rowLine(current.key, current.revision, current.values as Values)}`)
        continue
      }
      if (!current && !input.set) {
        lines.push(`${input.key}: refused, unknown key; give set to create the row.`)
        continue
      }
      const base = current
        ? { values: current.values as Values, provenance: current.provenance as Provenance }
        : { values: { [meta.state_column]: meta.states[0] } as Values, provenance: {} }
      const change = applyRowWrite(meta, base, input, by, at)
      const refusedText = change.refused.length ? `; refused: ${change.refused.join("; ")}` : ""
      if (change.changed.length === 0) {
        lines.push(`${input.key}: nothing written${refusedText}.`)
        continue
      }
      if (current) {
        const updated = must(
          await ctx.db
            .from("rows")
            .update({ values: change.values as Json, provenance: change.provenance as Json, revision: current.revision + 1, updated_at: at })
            .eq("id", current.id)
            .eq("revision", current.revision)
            .select("revision"),
          "rows"
        )
        if (!updated?.length) {
          lines.push(`${input.key}: refused, the row changed meanwhile; read it again with table.rows.`)
          continue
        }
        lines.push(`${input.key} → revision ${current.revision + 1}: ${change.changed.join(", ")}${refusedText}.`)
      } else {
        must(await ctx.db.from("rows").insert({ node_id: node.id, key: input.key, values: change.values as Json, provenance: change.provenance as Json }), "rows")
        lines.push(`${input.key} created (revision 1): ${change.changed.join(", ")}${refusedText}.`)
      }
    }
    return { teamId: node.team_id, text: lines.join("\n") }
  },
})

// --- table.claim / table.release --------------------------------------------------------------------

const claim = defineFunction({
  name: "table.claim",
  connector: "table",
  class: "write",
  description:
    "Reserves rows of the work queue for a worker: rows in the first state (or whose lease expired) move to the working state with a lease. Two claims never return the same row.",
  schema: z.strictObject({
    table: tableArg,
    worker: z.string().min(1).max(40).describe("Your worker name, reused in table.release"),
    limit: z.number().int().min(1).max(MAX_CLAIM).optional().describe("Rows to reserve, max 5 (default 1)"),
    lease_minutes: z.number().int().min(1).max(MAX_LEASE_MINUTES).optional().describe("Lease duration, max 60 (default 15)"),
  }),
  examples: [{ table: "ventes/suivi_prospects", worker: "claude-jb", limit: 3 }],
  refusals: ["no write access: names the owning team and its lead"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "write")
    const [waiting, working] = meta.states
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + (args.lease_minutes ?? 15) * 60_000).toISOString()
    const stateKey = `values->>${meta.state_column}`
    const [fresh, expired] = await Promise.all([
      ctx.db.from("rows").select("id, key, values, revision").eq("node_id", node.id).eq(stateKey, waiting).order("key").limit(MAX_CLAIM * 4),
      ctx.db.from("rows").select("id, key, values, revision").eq("node_id", node.id).eq(stateKey, working).lt("lease_until", now.toISOString()).order("key").limit(MAX_CLAIM * 4),
    ])
    const candidates = [...many(expired, "rows"), ...many(fresh, "rows")]
    const claimed: string[] = []
    for (const r of candidates) {
      if (claimed.length >= (args.limit ?? 1)) break
      const values = { ...(r.values as Values), [meta.state_column]: working }
      const done = must(
        await ctx.db
          .from("rows")
          .update({ values: values as Json, claimed_by: args.worker, lease_until: leaseUntil, revision: r.revision + 1, updated_at: now.toISOString() })
          .eq("id", r.id)
          .eq("revision", r.revision)
          .select("key, values, revision"),
        "rows"
      )
      if (done?.length) claimed.push(rowLine(done[0].key, done[0].revision, done[0].values as Values))
    }
    if (claimed.length === 0) return { teamId: node.team_id, text: `No row « ${waiting} » left to claim in ${node.path}.` }
    return {
      teamId: node.team_id,
      text: [`Claimed ${claimed.length} row(s) for ${args.worker} until ${leaseUntil.slice(11, 16)} UTC:`, ...claimed, "Release each one with table.release when done."].join("\n"),
    }
  },
})

const release = defineFunction({
  name: "table.release",
  connector: "table",
  class: "write",
  description: "Frees a row you claimed and sets its state (default: back to the first state).",
  schema: z.strictObject({
    table: tableArg,
    key: z.string().min(1).describe("Row key, e.g. P-001"),
    worker: z.string().min(1).max(40).describe("The worker name used in table.claim"),
    state: z.string().optional().describe("Final state, e.g. relancé (default: the first state)"),
  }),
  examples: [{ table: "ventes/suivi_prospects", key: "P-001", worker: "claude-jb", state: "relancé" }],
  refusals: ["row not claimed, or claimed by another worker (named)", "state outside the list"],
  run: async (ctx, args) => {
    const { node, meta } = await loadTable(ctx, args.table, "write")
    const state = args.state ?? meta.states[0]
    if (!meta.states.includes(state)) throw new ProtoError(`Unknown state ${state}. States: ${meta.states.join(", ")}.`)
    if (state === meta.states[1]) throw new ProtoError(`« ${state} » is set by table.claim, with a lease; release to another state.`)
    const row = must(await ctx.db.from("rows").select("id, key, values, provenance, revision, claimed_by").eq("node_id", node.id).eq("key", args.key).maybeSingle(), "rows")
    if (!row) throw new ProtoError(`Unknown row ${args.key} in ${node.path}.`)
    if (row.claimed_by !== args.worker) {
      throw new ProtoError(row.claimed_by ? `${args.key} is claimed by ${row.claimed_by}, not ${args.worker}.` : `${args.key} is not claimed.`)
    }
    const at = new Date().toISOString()
    const values = { ...(row.values as Values), [meta.state_column]: state }
    const provenance = { ...(row.provenance as Provenance), [meta.state_column]: { origin: "agent", by: ctx.identity.user.slug, at } }
    // Gardé par la révision lue et le travailleur : un bail expiré puis repris par un autre ne s'écrase pas.
    const updated = must(
      await ctx.db
        .from("rows")
        .update({ values: values as Json, provenance: provenance as Json, claimed_by: null, lease_until: null, revision: row.revision + 1, updated_at: at })
        .eq("id", row.id)
        .eq("revision", row.revision)
        .eq("claimed_by", args.worker)
        .select("revision"),
      "rows"
    )
    if (!updated?.length) throw new ProtoError(`${args.key} changed meanwhile (another worker may hold it now). Read it with table.rows.`)
    return { teamId: node.team_id, text: `${args.key} released → « ${state} » (revision ${updated[0].revision}).` }
  },
})

export const TABLE_FUNCTIONS = [schema, rows, aggregate, write, claim, release]
