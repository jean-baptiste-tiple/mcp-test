// Types d'accompagnement de proto-seed.mjs : sans eux, les tests d'intégration (TypeScript strict)
// importeraient seedProto en `any`. Déclaration seule, le module reste exécutable par `node`.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ProtoDatabase, ProtoOrgRow, ProtoTeamRow, ProtoUserRow } from "../../src/types/proto-database"

export type ProtoClient = SupabaseClient<ProtoDatabase, "proto">

export interface SeedResult {
  /** Par slug de base : `acme`, `delta`. */
  orgs: Record<string, ProtoOrgRow>
  /** Par slug de base : `jb`, `claire`, `paul`, `lea`, `jb-delta`. */
  users: Record<string, ProtoUserRow>
  /** Par `<org>/<équipe>` : `acme/ventes`. */
  teams: Record<string, ProtoTeamRow>
  /** Par `<org>/<chemin>` : `acme/guide`. */
  nodes: Record<string, string>
}

export declare function seedProto(client: ProtoClient, options?: { suffix?: string }): Promise<SeedResult>
export declare function deleteProtoOrgs(client: ProtoClient, slugs: string[]): Promise<void>
export declare function protoOrgSlugs(suffix?: string): string[]
