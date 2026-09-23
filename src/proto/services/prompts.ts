// Prompts suggérés (E04-S05, mesure 2 du doc fonctionnel) : un prompt MCP par procédure publiée,
// lisible et marquée `meta.suggested`. Sans eux, la capacité `prompts` n'aurait rien à montrer et la
// mesure 2 (affichage par host, enchaînement suivi) serait impossible.
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"

import type { ProtoDb } from "../db"
import { many } from "../db"
import { canRead, type Identity } from "../identity"

type SuggestedPrompt = { name: string; title: string; description: string; nodeId: string }

/** `ventes/relance_devis` → `relance_devis` : ASCII, sans `/` (Claude Code en fait une commande). */
function promptName(path: string): string {
  return path.split("/").pop()!
}

export async function listPrompts(db: ProtoDb, identity: Identity): Promise<SuggestedPrompt[]> {
  const nodes = many(
    await db.from("nodes").select("id, path, title, summary, team_id, meta").eq("org_id", identity.org.id).eq("kind", "procedure").eq("status", "published").order("path"),
    "nodes"
  )
  return nodes
    .filter((n) => (n.meta as { suggested?: boolean } | null)?.suggested === true && canRead(identity, n.team_id))
    .map((n) => ({ name: promptName(n.path), title: n.title, description: n.summary, nodeId: n.id }))
}

/** Le message proposé est la première phrase déclencheuse : le routage la reconnaît à coup sûr. */
export async function getPrompt(db: ProtoDb, identity: Identity, name: string): Promise<{ description: string; text: string }> {
  const prompt = (await listPrompts(db, identity)).find((p) => p.name === name)
  // Erreur de paramètre JSON-RPC (-32602) : le nom vient du host, pas d'une panne.
  if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt ${name}.`)
  const [first] = many(await db.from("triggers").select("phrase").eq("node_id", prompt.nodeId).eq("sense", "trigger").order("id").limit(1), "triggers")
  return { description: prompt.description, text: first?.phrase ?? prompt.title }
}
