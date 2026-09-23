// Qui appelle : l'utilisateur du segment d'URL, son organisation et ses équipes (ADR-003). Sans
// ce module, chaque service relirait l'utilisateur, et la règle de lecture et d'écriture des nœuds
// (architecture §9.4) serait réécrite dans read, write, call et context.
import type { ProtoDb } from "./db"
import { many, must, one } from "./db"

export type ConnectorLevel = "read" | "write"

export type Team = {
  id: string
  slug: string
  name: string
  rules: string
  connectors: Record<string, ConnectorLevel>
  leadName: string | null
  /** L'utilisateur en est membre. */
  member: boolean
}

export type Identity = {
  org: {
    id: string
    slug: string
    name: string
    prefix: string
    domains: string | null
    topics: { subject: string; path: string }[]
  }
  user: {
    id: string
    slug: string
    name: string
    role: "admin" | "member"
    profile: { langue?: string; ton?: string; preferences?: string }
    defaultTeamId: string | null
  }
  /** Toutes les équipes de l'organisation ; celles de l'utilisateur d'abord, la sienne par défaut en tête. */
  teams: Team[]
}

/** Segment d'URL accepté (check `users.slug`) : rien d'autre ne part en base. */
export const USER_SLUG = /^[a-z0-9-]{2,40}$/

export async function resolveIdentity(db: ProtoDb, slug: string): Promise<Identity | null> {
  if (!USER_SLUG.test(slug)) return null

  const user = must(await db.from("users").select("*").eq("slug", slug).maybeSingle(), "users")
  if (!user) return null

  const [org, teams, memberships, people] = await Promise.all([
    db.from("orgs").select("*").eq("id", user.org_id).single(),
    db.from("teams").select("*").eq("org_id", user.org_id),
    db.from("team_members").select("team_id").eq("user_id", user.id),
    db.from("users").select("id, name").eq("org_id", user.org_id),
  ])
  const orgRow = one(org, "orgs")
  const memberOf = new Set(many(memberships, "team_members").map((m) => m.team_id))
  const names = new Map(many(people, "users").map((p) => [p.id, p.name]))

  const allTeams: Team[] = many(teams, "teams").map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    rules: t.rules,
    connectors: (t.connectors ?? {}) as Record<string, ConnectorLevel>,
    leadName: t.lead_user_id ? (names.get(t.lead_user_id) ?? null) : null,
    member: memberOf.has(t.id),
  }))
  const rank = (t: Team) => (t.id === user.default_team_id ? 0 : t.member ? 1 : 2)
  allTeams.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

  return {
    org: {
      id: orgRow.id,
      slug: orgRow.slug,
      name: orgRow.name,
      prefix: orgRow.prefix,
      domains: orgRow.domains,
      topics: (orgRow.topics ?? []) as Identity["org"]["topics"],
    },
    user: {
      id: user.id,
      slug: user.slug,
      name: user.name,
      role: user.role,
      profile: (user.profile ?? {}) as Identity["user"]["profile"],
      defaultTeamId: user.default_team_id,
    },
    teams: allTeams,
  }
}

/** Nœud d'organisation (team null) : tous ; nœud d'équipe : ses membres et les admins. */
export function canRead(identity: Identity, teamId: string | null): boolean {
  if (teamId === null || identity.user.role === "admin") return true
  return identity.teams.some((t) => t.id === teamId && t.member)
}

/** Nœud d'organisation : les admins ; nœud d'équipe : ses membres et les admins. */
export function canWrite(identity: Identity, teamId: string | null): boolean {
  if (identity.user.role === "admin") return true
  return teamId !== null && identity.teams.some((t) => t.id === teamId && t.member)
}

/** « team Ventes (lead: Claire Morel) » : ce qu'un refus nomme pour dire à qui demander. */
export function describeTeam(identity: Identity, teamId: string | null): string {
  const team = identity.teams.find((t) => t.id === teamId)
  if (!team) return "the organisation admins"
  return team.leadName ? `team ${team.name} (lead: ${team.leadName})` : `team ${team.name}`
}
