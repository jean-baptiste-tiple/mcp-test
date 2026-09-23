// <prefix>_write (E04-S03 ; doc fonctionnel, « Arbre, pages et procédures ») : créer ou modifier une
// page ou une procédure par opérations sur ses sections, en brouillon, puis publier. Une écriture
// calculée sur une révision périmée est refusée avec l'état actuel. Publier le guide change les règles
// de l'organisation, donc invalide les ctx en cours. Sans ce service, rien ne s'écrit par le MCP.
import type { Json } from "@/types/proto-database"

import type { ProtoDb } from "../db"
import { many, must, one } from "../db"
import { canWrite, describeTeam, type Identity } from "../identity"
import { ProtoError, type ServiceResult } from "../result"
import { applyOps, type Section, type WriteOp } from "./sections"

/** Le guide de l'organisation : le publier incrémente la version des règles (architecture §9.3). */
export const GUIDE_PATH = "guide"

type Draft = {
  sections: Section[]
  base_revision: number
  title?: string
  summary?: string
  triggers?: string[]
  neighbors?: string[]
}

type WriteInput = {
  path: string
  base_revision?: number
  title?: string
  summary?: string
  kind?: "page" | "procedure"
  ops?: WriteOp[]
  triggers?: string[]
  neighbors?: string[]
  publish?: boolean
}

function outline(sections: Section[]): string {
  return sections.map((s) => `- ${s.title} (${s.body.length} characters)`).join("\n") || "- (no section)"
}

/** Une page créée sous `ventes/…` appartient à l'équipe Ventes ; ailleurs, à l'organisation. */
function teamForPath(identity: Identity, path: string): string | null {
  const first = path.split("/")[0]
  return identity.teams.find((t) => t.slug === first)?.id ?? null
}

export async function write(db: ProtoDb, identity: Identity, input: WriteInput): Promise<ServiceResult> {
  const p = identity.org.prefix
  const path = input.path.trim()
  if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(path)) {
    throw new ProtoError(`Invalid path ${path}: lowercase letters, digits and _ separated by /, e.g. conseil/cr_mairie_2026_09.`)
  }

  const node = must(await db.from("nodes").select("*").eq("org_id", identity.org.id).eq("path", path).maybeSingle(), "nodes")
  const teamId = node ? node.team_id : teamForPath(identity, path)
  if (!canWrite(identity, teamId)) throw new ProtoError(`Writing ${path} is reserved to ${describeTeam(identity, teamId)}. Ask them for access.`)

  // --- Création : un brouillon, révision 0 ---------------------------------------------------------
  if (!node) {
    if (!input.title || !input.summary) throw new ProtoError(`${path} does not exist: give title and summary to create it.`)
    const { sections, touched } = applyOps([], input.ops ?? [])
    const draft: Draft = { sections, base_revision: 0, triggers: input.triggers, neighbors: input.neighbors }
    const created = one(
      await db
        .from("nodes")
        .insert({
          org_id: identity.org.id,
          team_id: teamId,
          path,
          title: input.title,
          summary: input.summary,
          kind: input.kind ?? "page",
          status: "draft",
          revision: 0,
          sections: [],
          draft: draft as unknown as Json,
          updated_by: identity.user.id,
        })
        .select("*")
        .single(),
      "nodes"
    )
    if (input.publish) return publish(db, identity, created, draft)
    return {
      text: `Draft of ${path} created (revision 0): ${touched.join(", ") || "no section yet"}. Publish with ${p}_write {"path": "${path}", "base_revision": 0, "publish": true}.`,
      target: path,
      teamId,
    }
  }

  // --- Modification : garde de révision --------------------------------------------------------------
  if (input.base_revision === undefined || input.base_revision !== node.revision) {
    const sections = (node.sections ?? []) as Section[]
    throw new ProtoError(
      `stale revision: ${path} is at revision ${node.revision}${input.base_revision === undefined ? " and base_revision is missing" : `, not ${input.base_revision}`}. ` +
        `Nothing was written. Current state:\n# ${node.title} (revision ${node.revision}, ${node.status})\n${outline(sections)}\n` +
        `Read what you need, then write again with base_revision ${node.revision}.`
    )
  }

  const pending = node.draft as Draft | null
  const start = pending && pending.base_revision === node.revision ? pending.sections : ((node.sections ?? []) as Section[])
  const { sections, touched } = applyOps(start, input.ops ?? [])
  const draft: Draft = {
    sections,
    base_revision: node.revision,
    title: input.title ?? pending?.title,
    summary: input.summary ?? pending?.summary,
    triggers: input.triggers ?? pending?.triggers,
    neighbors: input.neighbors ?? pending?.neighbors,
  }
  if (!input.publish && touched.length === 0 && !input.title && !input.summary && !input.triggers && !input.neighbors) {
    throw new ProtoError(`Nothing to write: give ops, title, summary, triggers or neighbors, or publish: true.`)
  }

  const saved = must(
    await db
      .from("nodes")
      .update({ draft: draft as unknown as Json, updated_by: identity.user.id, updated_at: new Date().toISOString() })
      .eq("id", node.id)
      .eq("revision", node.revision)
      // Un brouillon ne change pas la révision : updated_at garde contre deux brouillons concurrents.
      .eq("updated_at", node.updated_at)
      .select("*"),
    "nodes"
  )
  if (!saved?.length) throw new ProtoError(`stale revision: ${path} changed while writing. Read it again, then retry.`)

  if (input.publish) return publish(db, identity, saved[0], draft)
  return {
    text: `Draft of ${path} saved on revision ${node.revision}: ${touched.join(", ") || "metadata only"}. Publish with ${p}_write {"path": "${path}", "base_revision": ${node.revision}, "publish": true}.`,
    target: path,
    teamId,
  }
}

type NodeRow = { id: string; org_id: string; path: string; title: string; summary: string; kind: string; revision: number; team_id: string | null; updated_at: string }

async function publish(db: ProtoDb, identity: Identity, node: NodeRow, draft: Draft): Promise<ServiceResult> {
  const p = identity.org.prefix
  const revision = node.revision + 1
  const title = draft.title ?? node.title
  const summary = draft.summary ?? node.summary
  const now = new Date().toISOString()

  const done = must(
    await db
      .from("nodes")
      .update({
        sections: draft.sections as unknown as Json,
        title,
        summary,
        status: "published",
        revision,
        draft: null,
        updated_by: identity.user.id,
        updated_at: now,
      })
      .eq("id", node.id)
      .eq("revision", node.revision)
      .eq("updated_at", node.updated_at)
      .select("id"),
    "nodes"
  )
  if (!done?.length) throw new ProtoError(`stale revision: ${node.path} changed while publishing. Read it again, then retry.`)

  must(
    await db.from("node_versions").insert({ node_id: node.id, revision, title, summary, sections: draft.sections as unknown as Json, author: identity.user.id }),
    "node_versions"
  )

  if (node.kind === "procedure" && (draft.triggers || draft.neighbors)) {
    const current = many(await db.from("triggers").select("phrase, sense").eq("node_id", node.id), "triggers")
    const triggers = draft.triggers ?? current.filter((t) => t.sense === "trigger").map((t) => t.phrase)
    const neighbors = draft.neighbors ?? current.filter((t) => t.sense === "neighbor").map((t) => t.phrase)
    must(await db.from("triggers").delete().eq("node_id", node.id), "triggers")
    const rows = [
      ...triggers.map((phrase) => ({ node_id: node.id, phrase, sense: "trigger" as const })),
      ...neighbors.map((phrase) => ({ node_id: node.id, phrase, sense: "neighbor" as const })),
    ]
    if (rows.length) must(await db.from("triggers").insert(rows), "triggers")
  }

  let rules = ""
  if (node.path === GUIDE_PATH) {
    const org = one(await db.from("orgs").select("rules_version").eq("id", identity.org.id).single(), "orgs")
    must(await db.from("orgs").update({ rules_version: org.rules_version + 1 }).eq("id", identity.org.id), "orgs")
    rules = ` The organisation's rules changed: every open ctx is now invalid, call ${p}_context again before any other ${p}_ tool.`
  }
  return { text: `Published ${node.path} revision ${revision} (${draft.sections.length} sections).${rules}`, target: node.path, teamId: node.team_id }
}
