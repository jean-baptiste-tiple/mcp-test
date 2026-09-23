// Types du schéma `proto` (migration 20260923090000_proto.sql), au format de `supabase gen types`.
// Écrits à la main le 2026-09-23 : `gen types --linked` exige le jeton de l'API de gestion (révoqué)
// et `--db-url` exige Docker (absent). À régénérer dès que l'un des deux revient :
//   supabase gen types typescript --linked --schema proto
// Sans ce fichier, chaque requête des services proto rendrait `any` et `tsc` ne verrait aucune
// colonne mal nommée.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>
  Update: Partial<Row>
  Relationships: []
}

export type ProtoOrgRow = {
  id: string
  slug: string
  name: string
  prefix: string
  domains: string | null
  topics: Json
  rules_version: number
  created_at: string
}

export type ProtoTeamRow = {
  id: string
  org_id: string
  slug: string
  name: string
  lead_user_id: string | null
  rules: string
  connectors: Json
}

export type ProtoUserRow = {
  id: string
  org_id: string
  slug: string
  name: string
  role: "admin" | "member"
  default_team_id: string | null
  profile: Json
}

export type ProtoTeamMemberRow = {
  team_id: string
  user_id: string
}

export type ProtoNodeRow = {
  id: string
  org_id: string
  team_id: string | null
  path: string
  title: string
  summary: string
  kind: "page" | "procedure" | "table"
  status: "draft" | "published"
  revision: number
  sections: Json
  draft: Json | null
  meta: Json
  updated_by: string | null
  updated_at: string
}

export type ProtoNodeVersionRow = {
  node_id: string
  revision: number
  title: string
  summary: string
  sections: Json
  author: string | null
  created_at: string
}

export type ProtoTriggerRow = {
  id: number
  node_id: string
  phrase: string
  sense: "trigger" | "neighbor"
  norm: string
  tsv: unknown
}

export type ProtoVocabularyRow = {
  id: number
  org_id: string
  term: string
  synonyms: string[]
}

export type ProtoRowRow = {
  id: string
  node_id: string
  key: string
  values: Json
  provenance: Json
  claimed_by: string | null
  lease_until: string | null
  revision: number
  updated_at: string
}

export type ProtoMailDraftRow = {
  id: string
  org_id: string
  user_id: string | null
  to_addr: string
  subject: string
  body: string
  status: "draft" | "sent"
  created_at: string
  sent_at: string | null
}

export type ProtoCtxRow = {
  code: string
  org_id: string
  user_id: string
  rules_version: number
  user_agent: string | null
  created_at: string
}

export type ProtoJournalRow = {
  id: number
  ts: string
  org_id: string | null
  user_id: string | null
  team_id: string | null
  ctx: string | null
  method: string
  tool: string | null
  target: string | null
  args: Json | null
  args_chars: number | null
  result_chars: number | null
  is_error: boolean
  error: string | null
  duration_ms: number | null
  client_name: string | null
  user_agent: string | null
}

export type ProtoFeedbackRow = {
  id: number
  org_id: string
  user_id: string | null
  ctx: string | null
  type: "friction" | "gap" | "error"
  text: string
  created_at: string
}

export type ProtoDatabase = {
  // Comme database.ts : sans elle, supabase-js retombe sur PostgREST 12 et type les lignes en `never`.
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  proto: {
    Tables: {
      orgs: Table<ProtoOrgRow, "slug" | "name" | "prefix">
      teams: Table<ProtoTeamRow, "org_id" | "slug" | "name">
      users: Table<ProtoUserRow, "org_id" | "slug" | "name">
      team_members: Table<ProtoTeamMemberRow, "team_id" | "user_id">
      nodes: Table<ProtoNodeRow, "org_id" | "path" | "title" | "summary" | "kind">
      node_versions: Table<ProtoNodeVersionRow, "node_id" | "revision" | "title" | "summary" | "sections">
      triggers: {
        Row: ProtoTriggerRow
        Insert: { node_id: string; phrase: string; sense: "trigger" | "neighbor" }
        Update: Partial<{ phrase: string; sense: "trigger" | "neighbor" }>
        Relationships: []
      }
      vocabulary: {
        Row: ProtoVocabularyRow
        Insert: { org_id: string; term: string; synonyms?: string[] }
        Update: Partial<{ term: string; synonyms: string[] }>
        Relationships: []
      }
      rows: Table<ProtoRowRow, "node_id" | "key">
      mail_drafts: Table<ProtoMailDraftRow, "id" | "org_id" | "to_addr" | "subject" | "body">
      ctx: Table<ProtoCtxRow, "code" | "org_id" | "user_id" | "rules_version">
      journal: {
        Row: ProtoJournalRow
        Insert: Partial<Omit<ProtoJournalRow, "id">> & { method: string }
        Update: Partial<Omit<ProtoJournalRow, "id">>
        Relationships: []
      }
      feedback: {
        Row: ProtoFeedbackRow
        Insert: Partial<Omit<ProtoFeedbackRow, "id">> & Pick<ProtoFeedbackRow, "org_id" | "type" | "text">
        Update: Partial<Omit<ProtoFeedbackRow, "id">>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      norm: { Args: { t: string }; Returns: string }
      route_candidates: {
        Args: { p_org: string; p_query: string; p_kind?: string; p_limit?: number }
        Returns: {
          node_id: string
          path: string
          title: string
          summary: string
          kind: string
          team_id: string | null
          s_trigger: number
          s_neighbor: number
          s_title: number
          lexical: number
          query_lexemes: number
        }[]
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
