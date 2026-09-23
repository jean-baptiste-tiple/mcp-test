// @vitest-environment node
// Prompts suggérés (E04-S05, mesure 2) : capacité déclarée, un prompt par procédure suggérée et
// lisible, message = première phrase déclencheuse ; journalisés.
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { ProtoDb } from "@/proto/db"

import { connectAs, hasDb, INTEGRATION_TIMEOUT, seedTestOrgs, SKIP_REASON, testDb, type TestOrgs } from "./proto-helpers"

describe.skipIf(!hasDb)(`serveur proto — prompts${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: ProtoDb
  let orgs: TestOrgs

  beforeAll(async () => {
    db = testDb()
    orgs = await seedTestOrgs(db)
  }, 60_000)

  afterAll(async () => {
    await orgs?.drop()
  }, 60_000)

  it("Acme : capacité prompts, trois prompts suggérés, message = première déclencheuse", async () => {
    const jb = await connectAs(db, orgs.seed.users.jb.slug)
    expect(jb.client.getServerCapabilities()?.prompts).toBeDefined()
    const { prompts } = await jb.client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(["preparer_rdv", "reponse_ticket", "relance_devis"])
    expect(prompts[2]).toMatchObject({ title: "Relancer les devis en attente" })

    const got = await jb.client.getPrompt({ name: "relance_devis" })
    expect(got.messages).toEqual([{ role: "user", content: { type: "text", text: "relance les devis en attente" } }])
    await expect(jb.client.getPrompt({ name: "inconnu" })).rejects.toThrow(/Unknown prompt inconnu/)
    expect(jb.journal.map((e) => e.method)).toEqual(["prompts/list", "prompts/get", "prompts/get"])
    expect(jb.journal[1]).toMatchObject({ target: "relance_devis", is_error: false })
  })

  it("lecture filtrée : Support ne voit pas les prompts de Ventes ; Delta a le sien", async () => {
    const paul = await connectAs(db, orgs.seed.users.paul.slug)
    expect((await paul.client.listPrompts()).prompts.map((p) => p.name)).toEqual(["reponse_ticket"])
    const delta = await connectAs(db, orgs.seed.users["jb-delta"].slug)
    expect((await delta.client.listPrompts()).prompts.map((p) => p.name)).toEqual(["planifier_tournee"])
  })
})
