// Types du schéma `oauth_test` (migrations 20260923131211_oauth_test.sql et
// 20260923141229_oauth_test_members_drop_role.sql), au format de `supabase gen types`. Écrits à la main le 2026-09-23, comme proto-database.ts : `gen types --linked`
// exige le jeton de l'API de gestion (révoqué) et `--db-url` exige Docker (absent). À régénérer dès que
// l'un des deux revient :
//   supabase gen types typescript --linked --schema oauth_test
// Sans ce fichier, chaque requête du serveur auth-test, des scripts et des tests rendrait `any`, et `tsc`
// ne verrait aucune colonne mal nommée.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type OauthTestOrgRow = {
  id: string
  slug: string
  name: string
  prefix: string
  host: string
  created_at: string
}

export type OauthTestMemberRow = {
  org_id: string
  user_id: string
  email: string
  created_at: string
}

export type OauthTestJournalRow = {
  id: number
  ts: string
  host: string | null
  path: string | null
  method: string | null
  tool: string | null
  decision: "unauthenticated" | "invalid_token" | "unknown_host" | "allowed" | "denied_not_member" | "consent" | "metadata"
  reason: string | null
  user_id: string | null
  email: string | null
  org_slug: string | null
  client_id: string | null
  client_name: string | null
  token: Json | null
  consent: Json | null
  user_agent: string | null
  ip: string | null
}

export type OauthTestDatabase = {
  // Comme database.ts : sans elle, supabase-js retombe sur PostgREST 12 et type les lignes en `never`.
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  oauth_test: {
    Tables: {
      orgs: {
        Row: OauthTestOrgRow
        Insert: Pick<OauthTestOrgRow, "slug" | "name" | "prefix" | "host"> & Partial<Pick<OauthTestOrgRow, "id" | "created_at">>
        Update: Partial<OauthTestOrgRow>
        Relationships: []
      }
      members: {
        Row: OauthTestMemberRow
        Insert: Pick<OauthTestMemberRow, "org_id" | "user_id" | "email"> & Partial<Pick<OauthTestMemberRow, "created_at">>
        Update: Partial<OauthTestMemberRow>
        Relationships: []
      }
      journal: {
        Row: OauthTestJournalRow
        // `id` : identité `generated always`, jamais écrite.
        Insert: Partial<Omit<OauthTestJournalRow, "id">> & Pick<OauthTestJournalRow, "decision">
        Update: Partial<Omit<OauthTestJournalRow, "id">>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    // Migrations 20260923134030_oauth_test_admin.sql et 20260923141329_oauth_test_admin_v2.sql (E03-S07),
    // service_role seulement. Les lignes de `auth` arrivent en jsonb, sans les clés des secrets, des codes
    // et des jetons (filtres dans l'en-tête de la v2).
    Functions: {
      auth_columns: {
        Args: never
        Returns: { table_name: string; column_name: string; data_type: string }[]
      }
      registered_clients: { Args: never; Returns: Json[] }
      user_sessions: { Args: { p_email: string }; Returns: Json[] }
      // `p_email` absent : toutes les lignes.
      oauth_authorizations: { Args: { p_email?: string }; Returns: Json[] }
      oauth_consents: { Args: { p_email?: string }; Returns: Json[] }
      revoke_user_sessions: { Args: { p_email: string }; Returns: number }
      revoke_client_grants: { Args: { p_email: string; p_client_name: string }; Returns: number }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
