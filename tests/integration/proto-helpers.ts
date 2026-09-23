// Outils des tests du serveur proto (architecture §9.5) : une organisation jetable par fichier de
// test, seedée par le même module que `pnpm proto:seed`, et un client MCP relié au vrai adaptateur
// par InMemoryTransport. Les services parlent au vrai Postgres du banc : c'est lui qu'on éprouve.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createClient } from "@supabase/supabase-js"

import type { ProtoDb } from "@/proto/db"
import { resolveIdentity } from "@/proto/identity"
import { buildServerOptions, installProto } from "@/proto/mcp/server"
import type { JournalEntry } from "@/proto/services/journal"
import type { ProtoDatabase } from "@/types/proto-database"

import { readEnv } from "../../scripts/lib/env.mjs"
import { deleteProtoOrgs, protoOrgSlugs, seedProto, type SeedResult } from "../../scripts/lib/proto-seed.mjs"

const env = readEnv()

/** Sans clés, les tests d'intégration proto sont sautés (message dans le describe). */
export const hasDb = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY)
export const SKIP_REASON = "proto : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absente de .env.local"

export function testDb(): ProtoDb {
  return createClient<ProtoDatabase, "proto">(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    db: { schema: "proto" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type TestOrgs = { suffix: string; seed: SeedResult; drop: () => Promise<void> }

/** Deux orgs jetables (Acme et Delta suffixées) ; `drop` les supprime avec tout ce qui en dépend. */
export async function seedTestOrgs(db: ProtoDb): Promise<TestOrgs> {
  const suffix = `t${Math.random().toString(36).slice(2, 6)}`
  const seed = await seedProto(db, { suffix })
  return { suffix, seed, drop: () => deleteProtoOrgs(db, protoOrgSlugs(suffix)) }
}

/** Un client MCP connecté comme l'utilisateur `slug`, comme le ferait la route. */
export async function connectAs(db: ProtoDb, slug: string, userAgent = "vitest") {
  const identity = await resolveIdentity(db, slug)
  if (!identity) throw new Error(`utilisateur inconnu : ${slug}`)

  const journal: JournalEntry[] = []
  const { serverInfo, ...options } = buildServerOptions(identity)
  const server = new McpServer(serverInfo, options)
  installProto(server, { db, identity, userAgent, journal })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "vitest", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `${identity.org.prefix}_${tool}`, arguments: args })
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? ""
    return { result, text, isError: result.isError === true }
  }
  /** Appelle context et rend le code ctx lu sur la première ligne. */
  const openContext = async (phrase?: string) => {
    const { text } = await call("context", phrase ? { phrase } : {})
    const code = /^ctx: (\S+)/.exec(text)?.[1]
    if (!code) throw new Error(`pas de ctx dans : ${text.slice(0, 200)}`)
    return { code, text }
  }

  return { client, identity, journal, call, openContext, prefix: identity.org.prefix }
}
