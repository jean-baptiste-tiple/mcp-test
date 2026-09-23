// <prefix>_read (E04-S03 ; doc fonctionnel, « Lire et écrire à moindre coût ») : un nœud par son
// chemin, en plan, par section ou depuis une révision, ou le contrat d'une fonction. Un résultat ne
// renvoie jamais une longue page entière. Sans ce service, le modèle n'a aucun moyen de lire une
// procédure non servie par context, ni le contrat d'une fonction avant de l'appeler.
import type { ProtoDb } from "../db"
import { many, must } from "../db"
import { describeFunction, getFunction, looksLikeFunction } from "../functions/registry"
import { canRead, describeTeam, type Identity } from "../identity"
import { ProtoError, type ServiceResult } from "../result"
import { findSection, type Section } from "./sections"

/** Au-delà, une page sort en plan (la mesure 3 du banc fixera ce chiffre par host). */
export const READ_MAX_CHARS = 12_000

type Draft = { sections: Section[]; base_revision: number }

const size = (sections: Section[]) => sections.reduce((n, s) => n + s.title.length + s.body.length, 0)
const render = (sections: Section[]) => sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")

export async function read(
  db: ProtoDb,
  identity: Identity,
  input: { path: string; section?: string; outline?: boolean; since_revision?: number; draft?: boolean }
): Promise<ServiceResult> {
  const p = identity.org.prefix
  const path = input.path.trim()

  if (looksLikeFunction(path)) {
    const fn = getFunction(path)
    if (!fn) throw new ProtoError(`Unknown function ${path}. Use ${p}_find with type function.`)
    return { text: describeFunction(fn, p), target: fn.name }
  }

  const node = must(await db.from("nodes").select("*").eq("org_id", identity.org.id).eq("path", path).maybeSingle(), "nodes")
  if (!node) throw new ProtoError(`Unknown path ${path}. Use ${p}_find to locate it.`)
  if (!canRead(identity, node.team_id)) throw new ProtoError(`${path} is reserved to ${describeTeam(identity, node.team_id)}. Ask them for access.`)

  const team = identity.teams.find((t) => t.id === node.team_id)?.name ?? "organisation"
  const header = [
    `# ${node.title}`,
    `path: ${node.path} · ${node.kind} · ${node.status} · revision ${node.revision} (${node.updated_at.slice(0, 10)}) · team ${team}`,
    `summary: ${node.summary}`,
  ]
  const result = (lines: string[]) => ({ text: [...header, ...lines].join("\n"), target: node.path, teamId: node.team_id })

  if (node.kind === "table") {
    const meta = node.meta as { columns: { name: string; type: string }[]; key: string; state_column: string }
    const { count } = await db.from("rows").select("id", { count: "exact", head: true }).eq("node_id", node.id)
    return result([
      `columns: ${meta.columns.map((c) => `${c.name} (${c.type})`).join(", ")} · key ${meta.key} · state ${meta.state_column} · ${count ?? 0} row(s)`,
      `Read rows with ${p}_call {"function": "table.rows", "arguments": {"table": "${node.path}"}}; contract of the table: table.schema.`,
    ])
  }

  const draft = node.draft as Draft | null
  if (input.draft && !draft) return result(["No pending draft."])
  const sections = ((input.draft ? draft!.sections : node.sections) ?? []) as Section[]
  const editHint = `To edit: ${p}_write with base_revision ${node.revision}${draft ? " (a draft is pending: read it with draft: true)" : ""}.`

  if (input.since_revision !== undefined) {
    if (input.since_revision >= node.revision) return result([`No change since revision ${input.since_revision}.`])
    const old = must(
      await db.from("node_versions").select("sections").eq("node_id", node.id).eq("revision", input.since_revision).maybeSingle(),
      "node_versions"
    )
    if (!old) {
      const known = many(await db.from("node_versions").select("revision").eq("node_id", node.id).order("revision"), "node_versions").map((v) => v.revision)
      throw new ProtoError(`Unknown revision ${input.since_revision} of ${path}. Revisions: ${known.join(", ")}.`)
    }
    const before = (old.sections ?? []) as Section[]
    const lines = [`Changes from revision ${input.since_revision} to ${node.revision}:`]
    for (const s of sections) {
      const i = findSection(before, s.title)
      if (i === -1) lines.push(`## ${s.title} (added)\n${s.body}`)
      else if (before[i].body !== s.body) lines.push(`## ${s.title} (changed)\n${s.body}`)
    }
    for (const s of before) if (findSection(sections, s.title) === -1) lines.push(`## ${s.title} (deleted)`)
    if (lines.length === 1) lines.push("Only the title or summary changed.")
    return result([...lines, editHint])
  }

  if (input.section !== undefined) {
    const i = findSection(sections, input.section)
    if (i === -1) throw new ProtoError(`Unknown section « ${input.section} » in ${path}. Sections: ${sections.map((s) => `« ${s.title} »`).join(", ")}.`)
    return result([render([sections[i]]), editHint])
  }

  if (input.outline || size(sections) > READ_MAX_CHARS) {
    return result([
      `outline (${sections.length} sections, ${size(sections)} characters${input.outline ? "" : `, over the ${READ_MAX_CHARS} read limit`}):`,
      ...sections.map((s) => `- ${s.title} (${s.body.length} characters)`),
      `Read one with ${p}_read {"path": "${path}", "section": "<title>"}.`,
    ])
  }
  return result([render(sections), editHint])
}
