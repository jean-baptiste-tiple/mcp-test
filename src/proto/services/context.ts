// Ce que renvoie <prefix>_context (doc fonctionnel, « Ce que renvoie context » ; architecture §9.4) :
// le code ctx puis des blocs classés par priorité, dans un budget d'environ 5 000 tokens, coupés
// par la fin. Sans ce service, le modèle n'a ni code, ni personne, ni règles, ni index des procédures.
import type { ProtoDb } from "../db"
import { many, must } from "../db"
import { canRead, type Identity } from "../identity"
import type { ServiceResult } from "../result"
import { issueCtx } from "./ctx"

/** 5 000 tokens ≈ 20 000 caractères : arbitrage du doc fonctionnel (coût sur l'abonnement). */
export const CONTEXT_BUDGET = 20_000

const MAX_PROCEDURES = 60
const MAX_RECENT = 20
const MAX_TOPICS = 15
const MAX_NEWS = 10
const TRIGGERS_SHOWN = 3
/** Sans conversation antérieure, les nouveautés remontent à 14 jours. */
const NEWS_WINDOW_DAYS = 14
const USAGE_WINDOW_DAYS = 90

export type ContextBlock = { name: string; text: string }

type Section = { title: string; body: string }

/**
 * Assemble les blocs dans l'ordre tant qu'ils tiennent. Le premier qui dépasse est coupé à la
 * ligne, les suivants sont omis, et une dernière ligne nomme ce qui manque.
 */
export function renderContext(blocks: ContextBlock[], budget: number, prefix: string): string {
  const reserve = 240 // place de la ligne finale
  const room = budget - reserve
  let text = ""
  const omitted: string[] = []

  for (const block of blocks) {
    if (omitted.length > 0) {
      omitted.push(block.name)
      continue
    }
    const separator = text ? "\n\n" : ""
    if (text.length + separator.length + block.text.length <= room) {
      text += separator + block.text
      continue
    }
    let partial = ""
    for (const line of block.text.split("\n")) {
      if (text.length + separator.length + partial.length + line.length + 1 > room) break
      partial += (partial ? "\n" : "") + line
    }
    if (partial) text += separator + partial
    omitted.push(partial.trim() ? `${block.name} (cut)` : block.name)
  }

  if (omitted.length === 0) return text
  return `${text}\n\n[Context budget reached. Omitted: ${omitted.join(", ")}. Use ${prefix}_find or ${prefix}_read for more.]`
}

function day(iso: string): string {
  return iso.slice(0, 10)
}

function codeBlock(prefix: string, code: string, phrase: string | undefined): ContextBlock {
  const lines = [
    `ctx: ${code}`,
    `Pass this ctx to every ${prefix}_ tool. If a tool answers "context has changed", call ${prefix}_context again.`,
  ]
  if (!phrase) lines.push(`No request given: call ${prefix}_context again with the user's request as phrase to get the matching procedure.`)
  return { name: "code", text: lines.join("\n") }
}

function personBlock(identity: Identity): ContextBlock {
  const { user } = identity
  const teams = identity.teams
    .filter((t) => t.member)
    .map((t) => (t.id === user.defaultTeamId ? `${t.name} (default)` : t.name))
    .join(", ")
  const lines = [`## You work for`, `${user.name} (${user.slug}), ${user.role}. Teams: ${teams || "none"}.`]
  if (user.profile.langue) lines.push(`Language: ${user.profile.langue}`)
  if (user.profile.ton) lines.push(`Tone: ${user.profile.ton}`)
  if (user.profile.preferences) lines.push(`Preferences: ${user.profile.preferences}`)
  return { name: "person", text: lines.join("\n") }
}

function orgBlock(identity: Identity, guide: Section[]): ContextBlock {
  const lines = [`## Organisation: ${identity.org.name}`]
  for (const section of guide) lines.push(`### ${section.title}`, section.body)
  return { name: "organisation", text: lines.join("\n") }
}

function connectorsLine(connectors: Record<string, string>): string {
  const entries = Object.entries(connectors)
  return entries.length ? entries.map(([name, level]) => `${name} (${level})`).join(", ") : "none"
}

function teamBlock(identity: Identity): ContextBlock {
  const mine = identity.teams.filter((t) => t.member)
  const lines: string[] = []
  mine.forEach((team, i) => {
    const lead = team.leadName ? ` (lead: ${team.leadName})` : ""
    lines.push(i === 0 ? `## Team ${team.name}${lead}` : `### Also in team ${team.name}${lead}`)
    if (team.rules) lines.push(`Rules: ${team.rules}`)
    lines.push(`Connectors: ${connectorsLine(team.connectors)}`)
  })
  return { name: "team", text: lines.length ? lines.join("\n") : "## Team\nNo team." }
}

type NodeSummary = {
  id: string
  path: string
  title: string
  summary: string
  kind: string
  team_id: string | null
  updated_at: string
}

/** Blocs 3 à 9 : ce que le serveur sait de la personne et de son organisation. */
async function knowledgeBlocks(db: ProtoDb, identity: Identity, since: Date): Promise<ContextBlock[]> {
  const usageSince = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000).toISOString()
  const [nodesResult, guideResult, usageResult] = await Promise.all([
    db
      .from("nodes")
      .select("id, path, title, summary, kind, team_id, updated_at")
      .eq("org_id", identity.org.id)
      .eq("status", "published"),
    db.from("nodes").select("sections").eq("org_id", identity.org.id).eq("path", "guide").maybeSingle(),
    db.from("journal").select("target").eq("org_id", identity.org.id).gte("ts", usageSince).not("target", "is", null).limit(5000),
  ])

  const readable = many(nodesResult, "nodes").filter((n) => canRead(identity, n.team_id))
  const guide = (must(guideResult, "nodes")?.sections ?? []) as Section[]

  const usage = new Map<string, number>()
  for (const row of many(usageResult, "journal")) {
    if (row.target) usage.set(row.target, (usage.get(row.target) ?? 0) + 1)
  }

  const procedures = readable
    .filter((n) => n.kind === "procedure")
    .sort((a, b) => (usage.get(b.path) ?? 0) - (usage.get(a.path) ?? 0) || a.path.localeCompare(b.path))
    .slice(0, MAX_PROCEDURES)

  const ids = readable.map((n) => n.id)
  const [triggersResult, versionsResult] = await Promise.all([
    procedures.length
      ? db.from("triggers").select("node_id, phrase").in("node_id", procedures.map((p) => p.id)).eq("sense", "trigger").order("id")
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db
          .from("node_versions")
          .select("node_id, revision, created_at")
          .in("node_id", ids)
          .gt("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(MAX_NEWS)
      : Promise.resolve({ data: [], error: null }),
  ])

  const phrases = new Map<string, string[]>()
  for (const t of many(triggersResult, "triggers") as { node_id: string; phrase: string }[]) {
    const list = phrases.get(t.node_id) ?? []
    if (list.length < TRIGGERS_SHOWN) list.push(t.phrase)
    phrases.set(t.node_id, list)
  }
  const byId = new Map<string, NodeSummary>(readable.map((n) => [n.id, n]))

  const news = (many(versionsResult, "node_versions") as { node_id: string; revision: number; created_at: string }[])
    .map((v) => {
      const node = byId.get(v.node_id)
      return node ? `- ${node.path} v${v.revision} (${day(v.created_at)}): ${node.title}` : null
    })
    .filter((line): line is string => line !== null)

  const recent = readable
    .filter((n) => n.kind !== "procedure" && n.path !== "guide")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, MAX_RECENT)

  return [
    orgBlock(identity, guide),
    teamBlock(identity),
    {
      name: "news",
      text: [`## What's new since ${day(since.toISOString())}`, ...(news.length ? news : ["Nothing new."])].join("\n"),
    },
    {
      name: "procedures",
      text: [
        `## Procedures you can run (${procedures.length})`,
        ...procedures.map((p) => {
          const quoted = (phrases.get(p.id) ?? []).map((q) => `« ${q} »`).join(" ")
          return `- ${p.path}: ${p.summary}${quoted ? ` ${quoted}` : ""}`
        }),
      ].join("\n"),
    },
    {
      name: "recent documents",
      text: ["## Recent documents", ...recent.map((n) => `- ${n.path} (${n.kind}, ${day(n.updated_at)}): ${n.title}`)].join("\n"),
    },
    {
      name: "topics",
      text: ["## By topic", ...identity.org.topics.slice(0, MAX_TOPICS).map((t) => `- ${t.subject}: ${t.path}`)].join("\n"),
    },
  ]
}

export async function buildContext(
  db: ProtoDb,
  identity: Identity,
  input: { phrase?: string },
  userAgent: string | null,
  budget = CONTEXT_BUDGET
): Promise<ServiceResult> {
  // La conversation précédente borne les nouveautés : lue AVANT d'émettre le nouveau code.
  const previous = many(
    await db.from("ctx").select("created_at").eq("user_id", identity.user.id).order("created_at", { ascending: false }).limit(1),
    "ctx"
  )
  const since = previous[0] ? new Date(previous[0].created_at) : new Date(Date.now() - NEWS_WINDOW_DAYS * 86_400_000)

  const code = await issueCtx(db, identity, userAgent)
  const phrase = input.phrase?.trim() || undefined
  const blocks = [codeBlock(identity.org.prefix, code, phrase), personBlock(identity), ...(await knowledgeBlocks(db, identity, since))]

  return { text: renderContext(blocks, budget, identity.org.prefix), ctx: code, target: phrase ?? null }
}
