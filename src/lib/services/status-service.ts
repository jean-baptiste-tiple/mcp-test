// Parité par services partagés (mcp-patterns §1) : TOUTE la logique métier vit ici, les
// adaptateurs (tool MCP, Server Action) restent fins.
// Service DÉMO du starter — retiré en S02 avec le tool get_status.
import { MCP_SERVER_INFO } from "@/mcp/config"
import type { GetStatusInputType, StatusResultType } from "@/lib/schemas/status"

export async function getStatus(input: GetStatusInputType): Promise<StatusResultType> {
  return {
    product: MCP_SERVER_INFO.name,
    version: MCP_SERVER_INFO.version,
    status: "ok",
    ...(input.verbose ? { components: [{ name: "database", status: "not wired yet (S02)" }] } : {}),
  }
}
