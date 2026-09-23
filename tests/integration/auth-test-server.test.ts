// @vitest-environment node
// Adaptateur MCP du serveur auth-test contre le Supabase du banc (E03-S02, architecture §10.6) : jeton réel
// (signInWithPassword) vérifié par la vraie JWKS du projet, InMemoryTransport portant l'AuthInfo qu'en tire
// makeVerifyToken, comme withMcpAuth en HTTP. Whoami d'un membre (organisation et préfixe de l'hôte), refus
// d'un non-membre, retrait puis refus avec le même jeton, echo et son plafond, parité texte /
// structuredContent, journal en base. Organisations et utilisateurs jetables, supprimés en fin de fichier.
// Jamais un jeton dans une assertion qui l'afficherait en échec : `includes(...)` comparé à false.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { OauthTestDb } from "@/auth-test/db"
import { flushJournal, type JournalEntry } from "@/auth-test/journal"
import { buildServerOptions, installAuthTest } from "@/auth-test/mcp/server"
import { makeVerifyToken, projectIssuer, rejectionOf } from "@/auth-test/token"
import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { setMember } from "../../scripts/lib/oauth-seed.mjs"

import {
  createTestUser,
  hasDb,
  INTEGRATION_TIMEOUT,
  seedTestOrgs,
  signIn,
  SKIP_REASON,
  stubPublicEnv,
  testDb,
  type TestOrgs,
  type TestUser,
} from "./auth-test-helpers"

const CLAIM_KEYS = ["iss", "aud", "sub", "email", "client_id", "session_id", "iat", "exp", "amr", "scope"]
const USER_AGENT = "vitest-auth-test-server"
const PATH = "/api/auth-test/mcp"

describe.skipIf(!hasDb)(`auth-test — serveur MCP${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: OauthTestDb
  let orgs: TestOrgs
  let member: TestUser // membre d'Acme et de Delta, comme JB
  let outsider: TestUser // membre d'aucune organisation
  let memberToken: string
  let memberAuth: AuthInfo
  let outsiderAuth: AuthInfo

  const acme = () => orgs.seed.orgs.acme
  const delta = () => orgs.seed.orgs.delta

  beforeAll(async () => {
    stubPublicEnv()
    db = testDb()
    orgs = await seedTestOrgs(db)
    // Un par un : si une création échoue, ceux déjà créés restent assignés et afterAll les supprime.
    member = await createTestUser(db)
    outsider = await createTestUser(db)
    await setMember(db, acme().slug, member.email, "add")
    await setMember(db, delta().slug, member.email, "add")

    memberToken = await signIn(member.email, member.password)
    const outsiderToken = await signIn(outsider.email, outsider.password)
    const verify = makeVerifyToken() // JWKS distante du projet, émetteur tiré de NEXT_PUBLIC_SUPABASE_URL
    const [memberInfo, outsiderInfo] = await Promise.all(
      [memberToken, outsiderToken].map((token) => verify(new Request(`https://example.test${PATH}`), token))
    )
    if (!memberInfo || !outsiderInfo) throw new Error("jeton réel refusé par la JWKS du projet")
    memberAuth = memberInfo
    outsiderAuth = outsiderInfo
  }, 60_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    await Promise.all([orgs?.drop(), ...[member, outsider].filter(Boolean).map((user) => user.remove())])
  }, 60_000)

  /** Un client MCP relié à l'adaptateur de cet hôte, chaque message accompagné de l'AuthInfo (ce que fait withMcpAuth). */
  async function connect(org: OauthTestOrgRow, auth: AuthInfo) {
    const journal: JournalEntry[] = []
    const { serverInfo, ...options } = buildServerOptions(org)
    const server = new McpServer(serverInfo, options)
    installAuthTest(server, { org, request: { host: org.host, path: PATH, user_agent: USER_AGENT, ip: null }, journal })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const send = clientTransport.send.bind(clientTransport)
    clientTransport.send = (message, sendOptions) => send(message, { ...sendOptions, authInfo: auth })
    const client = new Client({ name: "vitest", version: "0.0.0" })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const call = async (tool: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name: `${org.prefix}_${tool}`, arguments: args })
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? ""
      return { result, text }
    }
    return { client, journal, call }
  }

  it("jeton réel : vérifié par la JWKS du projet, claims résumées ; signature altérée refusée (signature)", async () => {
    expect(memberAuth.extra?.claims).toMatchObject({ iss: projectIssuer(), sub: member.id, email: member.email, aud: "authenticated" })
    expect(memberAuth.token === memberToken).toBe(true)

    const [header, payload, signature] = memberToken.split(".")
    const tail = signature.slice(-4) === "AAAA" ? "BBBB" : "AAAA"
    const request = new Request(`https://example.test${PATH}`)
    expect(await makeVerifyToken()(request, `${header}.${payload}.${signature.slice(0, -4)}${tail}`)).toBeUndefined()
    expect(rejectionOf(request)).toEqual({ reason: "signature" })
  })

  it("whoami d'un membre sur Acme : organisation et préfixe de l'hôte, personne, jeton résumé ; texte = structuredContent.text", async () => {
    const session = await connect(acme(), memberAuth)
    const { result, text } = await session.call("whoami", { note: "vitest/acme" })

    expect(result.isError).toBeFalsy()
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured.text).toBe(text)
    expect(structured).toMatchObject({
      person: { id: member.id, email: member.email },
      organisation: { slug: acme().slug, name: acme().name, host: acme().host, prefix: acme().prefix },
      membership: { member: true },
      token: { iss: projectIssuer(), aud: "authenticated", session_id: expect.any(String), expires_in_s: expect.any(Number) },
      request: { host: acme().host, path: PATH, user_agent: USER_AGENT },
      note: "vitest/acme",
      next_actions: [`${acme().prefix}_echo`],
    })
    const token = structured.token as Record<string, unknown>
    expect(token.expires_in_s).toBeGreaterThan(0)
    expect(Object.keys(token).filter((key) => ![...CLAIM_KEYS, "expires_in_s"].includes(key))).toEqual([])
    expect(text).toContain(`You are signed in as ${member.email}`)
    expect(text).toContain(`member of ${acme().name}`)
    expect(JSON.stringify(result).includes(memberToken)).toBe(false)
  })

  it("le même jeton sur Delta : outils et organisation de Delta ; le préfixe d'Acme n'existe pas ici", async () => {
    const session = await connect(delta(), memberAuth)
    expect(session.client.getServerVersion()).toMatchObject({ name: `${delta().slug}-auth-test`, title: `${delta().name} (auth test)` })
    expect((await session.client.listTools()).tools.map((tool) => tool.name)).toEqual([`${delta().prefix}_whoami`, `${delta().prefix}_echo`])

    const { result } = await session.call("whoami")
    expect(result.structuredContent).toMatchObject({ organisation: { slug: delta().slug, prefix: delta().prefix }, note: null })

    const foreign = await session.client.callTool({ name: `${acme().prefix}_whoami`, arguments: {} })
    expect(foreign.isError).toBe(true)
  })

  it("non-membre : tools/list servi ; whoami et echo refusés avec le message exact, rien d'autre", async () => {
    const session = await connect(acme(), outsiderAuth)
    expect((await session.client.listTools()).tools).toHaveLength(2)

    const expected = `You are signed in as ${outsider.email} but you are not a member of ${acme().name}. Ask an administrator of ${acme().name} to add you.`
    for (const tool of ["whoami", "echo"]) {
      const { result, text } = await session.call(tool, { message: "x" })
      expect(result.isError, tool).toBe(true)
      expect(text, tool).toBe(expected)
      expect(result.content, tool).toHaveLength(1)
      expect(result.structuredContent, tool).toBeUndefined()
    }
    expect(session.journal.map((entry) => `${entry.method}:${entry.decision}`)).toEqual([
      "tools/list:allowed",
      "tools/call:denied_not_member",
      "tools/call:denied_not_member",
    ])
    expect(session.journal[1]).toMatchObject({ user_id: outsider.id, email: outsider.email, org_slug: acme().slug })
  })

  it("retrait puis refus avec le même jeton (aucun cache) ; ajout puis accepté", async () => {
    const session = await connect(acme(), memberAuth)
    expect((await session.call("whoami")).result.isError).toBeFalsy()

    expect(await setMember(db, acme().slug, member.email, "remove")).toBe(true)
    try {
      const refused = await session.call("whoami")
      expect(refused.result.isError).toBe(true)
      expect(refused.text).toContain(`not a member of ${acme().name}`)
    } finally {
      expect(await setMember(db, acme().slug, member.email, "add")).toBe(true)
    }
    expect((await session.call("whoami")).result.isError).toBeFalsy()
  })

  it("echo : arguments reçus dans le texte et structuredContent.args ; au-delà de 64 ko ou sans message, refus actionnable", async () => {
    const session = await connect(acme(), memberAuth)
    const args = { message: "bonjour", extra: { n: 1, list: ["a", "é"] } }
    const { result, text } = await session.call("echo", args)

    expect(result.isError).toBeFalsy()
    expect(text).toBe(JSON.stringify(args))
    expect(result.structuredContent).toEqual({ text, args, next_actions: [`${acme().prefix}_whoami`] })

    const big = await session.call("echo", { message: "é".repeat(33_000) }) // 66 000 octets
    expect(big.result.isError).toBe(true)
    expect(big.text).toMatch(/^Arguments too large for \w+_echo: \d+ bytes, max 65536\. Send a shorter message\.$/)

    const invalid = await session.call("echo", { note: "sans message" })
    expect(invalid.result.isError).toBe(true)
    expect(invalid.text).toMatch(/^Invalid arguments for \w+_echo: message: /)
  })

  it("journal : une ligne par tools/list et tools/call, écrite en base à la clé secrète, jamais le jeton", async () => {
    const session = await connect(delta(), memberAuth)
    await session.client.listTools()
    await session.call("whoami")
    await session.call("echo", { message: "journal" })
    await session.call("nope")

    const p = delta().prefix
    expect(session.journal.map((entry) => `${entry.method}|${entry.tool ?? ""}|${entry.decision}|${entry.reason ?? ""}`)).toEqual([
      "tools/list||allowed|",
      `tools/call|${p}_whoami|allowed|`,
      `tools/call|${p}_echo|allowed|`,
      `tools/call|${p}_nope|allowed|unknown_tool`,
    ])

    await flushJournal(db, session.journal)
    const rows = (await db.from("journal").select("*").eq("host", delta().host).eq("user_agent", USER_AGENT).order("id")).data ?? []
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row).toMatchObject({ org_slug: delta().slug, user_id: member.id, email: member.email, path: PATH })
      expect(Object.keys(row.token ?? {}).filter((key) => !CLAIM_KEYS.includes(key))).toEqual([])
    }
    expect(JSON.stringify(rows).includes(memberToken)).toBe(false)
  })
})
