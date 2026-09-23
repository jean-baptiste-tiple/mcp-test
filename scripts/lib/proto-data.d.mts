// Types d'accompagnement de proto-data.mjs : les tests (TypeScript strict) lisent les données
// fictives sans base (taille de la page longue, phrases par procédure).
export interface ProtoSection {
  title: string
  body: string
}

export interface ProtoNodeData {
  path: string
  team: string | null
  kind: "page" | "procedure" | "table"
  title: string
  summary: string
  sections: ProtoSection[]
  meta?: Record<string, unknown>
  triggers?: string[]
  neighbors?: string[]
  rows?: { key: string; values: Record<string, unknown> }[]
}

export interface ProtoOrgData {
  slug: string
  name: string
  prefix: string
  domains: string | null
  topics: { subject: string; path: string }[]
  teams: { slug: string; name: string; lead: string; rules: string; connectors: Record<string, "read" | "write"> }[]
  users: {
    slug: string
    name: string
    role: "admin" | "member"
    default_team: string
    teams: string[]
    profile: Record<string, string>
  }[]
  vocabulary: { term: string; synonyms: string[] }[]
  nodes: ProtoNodeData[]
}

export declare const PROTO_ORGS: ProtoOrgData[]
