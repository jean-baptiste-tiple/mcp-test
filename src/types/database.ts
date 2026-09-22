export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bench_events: {
        Row: {
          args: Json | null
          client_name: string | null
          client_version: string | null
          error_text: string | null
          id: number
          ip: string | null
          is_error: boolean
          list_changed_sent: boolean | null
          method: string
          protocol_version: string | null
          response_chars: number | null
          rpc_id: string | null
          scenario_slug: string | null
          server_version: string | null
          session_id: string | null
          tool_name: string | null
          tools_served: number | null
          ts: string
          user_agent: string | null
        }
        Insert: {
          args?: Json | null
          client_name?: string | null
          client_version?: string | null
          error_text?: string | null
          id?: never
          ip?: string | null
          is_error?: boolean
          list_changed_sent?: boolean | null
          method: string
          protocol_version?: string | null
          response_chars?: number | null
          rpc_id?: string | null
          scenario_slug?: string | null
          server_version?: string | null
          session_id?: string | null
          tool_name?: string | null
          tools_served?: number | null
          ts?: string
          user_agent?: string | null
        }
        Update: {
          args?: Json | null
          client_name?: string | null
          client_version?: string | null
          error_text?: string | null
          id?: never
          ip?: string | null
          is_error?: boolean
          list_changed_sent?: boolean | null
          method?: string
          protocol_version?: string | null
          response_chars?: number | null
          rpc_id?: string | null
          scenario_slug?: string | null
          server_version?: string | null
          session_id?: string | null
          tool_name?: string | null
          tools_served?: number | null
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      bench_scenarios: {
        Row: {
          ack_ttl_seconds: number | null
          created_at: string
          id: string
          instructions: string
          is_active: boolean
          notes: string | null
          readme_content: string | null
          readme_lever: string
          server_name: string
          server_title: string | null
          server_version: string
          slug: string
          updated_at: string
        }
        Insert: {
          ack_ttl_seconds?: number | null
          created_at?: string
          id?: string
          instructions?: string
          is_active?: boolean
          notes?: string | null
          readme_content?: string | null
          readme_lever?: string
          server_name?: string
          server_title?: string | null
          server_version?: string
          slug: string
          updated_at?: string
        }
        Update: {
          ack_ttl_seconds?: number | null
          created_at?: string
          id?: string
          instructions?: string
          is_active?: boolean
          notes?: string | null
          readme_content?: string | null
          readme_lever?: string
          server_name?: string
          server_title?: string | null
          server_version?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      bench_tools: {
        Row: {
          annotations: Json | null
          created_at: string
          description: string
          enabled: boolean
          handler: string
          id: string
          input_schema: Json
          name: string
          scenario_id: string
          sort_order: number
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          annotations?: Json | null
          created_at?: string
          description?: string
          enabled?: boolean
          handler?: string
          id?: string
          input_schema?: Json
          name: string
          scenario_id: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          annotations?: Json | null
          created_at?: string
          description?: string
          enabled?: boolean
          handler?: string
          id?: string
          input_schema?: Json
          name?: string
          scenario_id?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bench_tools_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "bench_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
