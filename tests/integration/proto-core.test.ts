// @vitest-environment node
// Preuves 1, 2, 3, 5 sur context et feedback (E04-S01), contre le Postgres du banc, sur des
// organisations jetables. Voir architecture §9.5.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { ProtoDb } from "@/proto/db"
import { resolveIdentity } from "@/proto/identity"
import { buildContext, CONTEXT_BUDGET } from "@/proto/services/context"
import { flushJournal } from "@/proto/services/journal"

import { connectAs, hasDb, INTEGRATION_TIMEOUT, seedTestOrgs, SKIP_REASON, testDb, type TestOrgs } from "./proto-helpers"

describe.skipIf(!hasDb)(`serveur proto — socle${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: ProtoDb
  let orgs: TestOrgs
  const jb = () => orgs.seed.users.jb.slug
  const claire = () => orgs.seed.users.claire.slug

  beforeAll(async () => {
    db = testDb()
    orgs = await seedTestOrgs(db)
  }, 60_000)

  afterAll(async () => {
    await orgs?.drop()
  }, 60_000)

  it("un slug inconnu ou mal formé ne résout personne", async () => {
    expect(await resolveIdentity(db, "personne-inconnue-zz")).toBeNull()
    expect(await resolveIdentity(db, "../etc")).toBeNull()
  })

  it("tools/list : six outils préfixés par l'organisation de l'utilisateur", async () => {
    const acme = await connectAs(db, jb())
    const delta = await connectAs(db, orgs.seed.users["jb-delta"].slug)
    const names = (await acme.client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(["context", "find", "read", "call", "write", "feedback"].map((k) => `${acme.prefix}_${k}`))
    expect((await delta.client.listTools()).tools[0].name).toBe(`${delta.prefix}_context`)
    expect(acme.client.getServerVersion()?.title).toBe("Acme Énergies")
    expect(acme.client.getInstructions()).toContain(`${acme.prefix}_context first`)
  })

  it("context : un code ctx en base et les blocs attendus, dans le budget (preuve 3)", async () => {
    const session = await connectAs(db, jb())
    const { code, text } = await session.openContext()
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(text.length).toBeLessThanOrEqual(CONTEXT_BUDGET)
    for (const heading of ["## You work for", "## Organisation: Acme Énergies", "## Team Conseil", "## What's new", "## Procedures you can run", "## Recent documents", "## By topic"]) {
      expect(text).toContain(heading)
    }
    expect(text).toContain("ventes/relance_devis")
    const row = (await db.from("ctx").select("user_id, rules_version").eq("code", code).single()).data
    expect(row?.user_id).toBe(session.identity.user.id)
  })

  it("buildContext avec un budget de 1 500 : code entier, blocs de fin omis et nommés (preuve 3)", async () => {
    const identity = (await resolveIdentity(db, jb()))!
    const { text, ctx } = await buildContext(db, identity, {}, "vitest", 1500)
    expect(text.length).toBeLessThanOrEqual(1500)
    expect(text.startsWith(`ctx: ${ctx}\n`)).toBe(true)
    expect(text).toMatch(/Omitted: .*topics\./)
    expect(text).not.toContain("## By topic")
  })

  it("context : un membre de Support ne voit pas les procédures de Ventes", async () => {
    const paul = await connectAs(db, orgs.seed.users.paul.slug)
    const { text } = await paul.openContext()
    expect(text).toContain("support/reponse_ticket")
    expect(text).not.toContain("ventes/relance_devis")
  })

  it("preuve 1 : sans ctx, ctx inconnu, ctx d'un autre utilisateur → appeler context", async () => {
    const session = await connectAs(db, jb())
    const other = await connectAs(db, claire())
    const { code: otherCode } = await other.openContext()
    const expected = `Missing or unknown ctx. Call ${session.prefix}_context first and pass its ctx code.`

    for (const tool of ["find", "read", "call", "write", "feedback"]) {
      const res = await session.call(tool, { query: "x", path: "guide", function: "table.rows", type: "gap", text: "x" })
      expect(res.isError, tool).toBe(true)
      expect(res.text, tool).toBe(expected)
    }
    expect((await session.call("feedback", { ctx: "ZZZZ-ZZZZ", type: "gap", text: "x" })).text).toBe(expected)
    expect((await session.call("feedback", { ctx: otherCode, type: "gap", text: "x" })).text).toBe(expected)
    expect((await session.call("feedback", { ctx: "X".repeat(100_000), type: "gap", text: "x" })).text).toBe(expected)
  })

  it("preuve 2 : la version des règles change → context has changed", async () => {
    const session = await connectAs(db, jb())
    const { code } = await session.openContext()
    expect((await session.call("feedback", { ctx: code, type: "friction", text: "avant" })).isError).toBe(false)

    const orgId = session.identity.org.id
    const current = (await db.from("orgs").select("rules_version").eq("id", orgId).single()).data!.rules_version
    await db.from("orgs").update({ rules_version: current + 1 }).eq("id", orgId)

    const res = await session.call("feedback", { ctx: code, type: "friction", text: "après" })
    expect(res.isError).toBe(true)
    expect(res.text).toBe(`context has changed, call ${session.prefix}_context again`)

    const fresh = await session.openContext()
    expect((await session.call("feedback", { ctx: fresh.code, type: "friction", text: "de nouveau" })).isError).toBe(false)
  })

  it("feedback : un numéro de ticket et une ligne en base ; preuve 5 sur context et feedback", async () => {
    const session = await connectAs(db, jb())
    const opened = await session.call("context", { phrase: "bonjour" })
    const code = /^ctx: (\S+)/.exec(opened.text)![1]
    const fb = await session.call("feedback", { ctx: code, type: "gap", text: "Il manque une fonction d'export." })
    expect(fb.text).toMatch(/^Ticket FB-\d{4,} recorded/)

    for (const res of [opened, fb]) {
      expect((res.result.structuredContent as { text: string }).text).toBe(res.text)
    }
    const rows = (await db.from("feedback").select("text").eq("ctx", code)).data ?? []
    expect(rows.map((r) => r.text)).toEqual(["Il manque une fonction d'export."])
  })

  it("arguments invalides : refus qui liste le champ", async () => {
    const session = await connectAs(db, jb())
    const { code } = await session.openContext()
    const res = await session.call("feedback", { ctx: code, type: "bogus", text: "x" })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/^Invalid arguments for .*_feedback: type:/)
  })

  it("journal : une entrée par requête, écrite en base ; un journal en panne n'échoue pas", async () => {
    const session = await connectAs(db, jb(), "journal-test")
    await session.client.listTools()
    const { code } = await session.openContext("quelle heure est-il ?")
    await session.call("feedback", { ctx: code, type: "gap", text: "x" })
    await session.call("feedback", {})

    expect(session.journal.map((e) => `${e.method}:${e.tool ?? ""}`)).toEqual([
      "tools/list:",
      `tools/call:${session.prefix}_context`,
      `tools/call:${session.prefix}_feedback`,
      `tools/call:${session.prefix}_feedback`,
    ])
    const [, context, feedback, refused] = session.journal
    expect(context).toMatchObject({ ctx: code, target: "quelle heure est-il ?", is_error: false })
    expect(feedback).toMatchObject({ ctx: code, is_error: false })
    expect(feedback.target).toMatch(/^FB-/)
    expect(refused).toMatchObject({ is_error: true })
    expect(context.result_chars).toBeGreaterThan(1000)
    expect(context.duration_ms).toBeGreaterThanOrEqual(0)

    await flushJournal(db, session.journal)
    const rows = (await db.from("journal").select("method, tool, ctx").eq("user_agent", "journal-test").eq("org_id", session.identity.org.id)).data ?? []
    expect(rows).toHaveLength(4)

    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken = { from: () => ({ insert: async () => ({ error: { message: "down" } }) }) } as unknown as ProtoDb
    await expect(flushJournal(broken, session.journal)).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
