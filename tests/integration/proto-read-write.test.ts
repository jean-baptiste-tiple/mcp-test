// @vitest-environment node
// read et write (E04-S03) : plan, section, révisions, contrat de fonction, brouillon et publication,
// preuve 6 (révision périmée refusée avec l'état actuel), preuve 2 par le produit (publier le guide).
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { ProtoDb } from "@/proto/db"

import { connectAs, hasDb, INTEGRATION_TIMEOUT, seedTestOrgs, SKIP_REASON, testDb, type TestOrgs } from "./proto-helpers"

describe.skipIf(!hasDb)(`serveur proto — read et write${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: ProtoDb
  let orgs: TestOrgs

  beforeAll(async () => {
    db = testDb()
    orgs = await seedTestOrgs(db)
  }, 60_000)

  afterAll(async () => {
    await orgs?.drop()
  }, 60_000)

  async function as(user: string) {
    const session = await connectAs(db, orgs.seed.users[user].slug)
    const { code } = await session.openContext()
    return {
      ...session,
      code,
      read: (args: Record<string, unknown>) => session.call("read", { ctx: code, ...args }),
      write: (args: Record<string, unknown>) => session.call("write", { ctx: code, ...args }),
    }
  }

  it("page longue : plan, jamais le corps entier ; puis une section par son titre", async () => {
    const jb = await as("jb")
    const outline = await jb.read({ path: "conseil/methode_etude" })
    expect(outline.text).toContain("outline (12 sections")
    expect(outline.text).toContain("over the 12000 read limit")
    expect(outline.text.length).toBeLessThan(2000)

    const section = await jb.read({ path: "conseil/methode_etude", section: "dimensionnement" })
    expect(section.text).toContain("## Dimensionnement\nChoisir la puissance crête")
    expect(section.text).not.toContain("## Clé de répartition")

    const unknown = await jb.read({ path: "conseil/methode_etude", section: "Budget" })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain("« Objet de l'étude »")
  })

  it("page courte entière ; contrat d'une fonction ; tableau ; chemin inconnu", async () => {
    const jb = await as("jb")
    const page = await jb.read({ path: "conseil/grille_tarifaire_2026" })
    expect(page.text).toContain("## Études\nPré-étude : 1 500 € HT.")
    expect(page.text).toContain(`To edit: ${jb.prefix}_write with base_revision 1`)

    const contract = await jb.read({ path: "sellsy.list_estimates" })
    expect(contract.text).toMatch(/^Function sellsy\.list_estimates \(connector sellsy, class read\)/)
    expect(contract.text).toContain("Arguments (JSON Schema):")
    expect(contract.text).toContain(`${jb.prefix}_call {"function": "sellsy.list_estimates"`)

    const table = await jb.read({ path: "ventes/suivi_prospects" })
    expect(table.text).toContain("12 row(s)")
    expect(table.text).toContain('"function": "table.rows"')

    const missing = await jb.read({ path: "ventes/inexistant" })
    expect(missing.text).toBe(`Unknown path ventes/inexistant. Use ${jb.prefix}_find to locate it.`)
    for (const res of [page, contract, table]) expect((res.result.structuredContent as { text: string }).text).toBe(res.text)
  })

  it("droits : Support ne lit ni n'écrit une page de Ventes, refus nommant le responsable", async () => {
    const paul = await as("paul")
    expect((await paul.read({ path: "ventes/modele_relance" })).text).toBe("ventes/modele_relance is reserved to team Ventes (lead: Claire Morel). Ask them for access.")
    const w = await paul.write({ path: "ventes/modele_relance", base_revision: 1, ops: [{ op: "append", section: "Corps", text: "x" }] })
    expect(w.text).toMatch(/^Writing ventes\/modele_relance is reserved to team Ventes \(lead: Claire Morel\)/)
  })

  it("création : brouillon en révision 0, résumé plafonné, puis publication", async () => {
    const jb = await as("jb")
    const tooLong = await jb.write({ path: "conseil/cr_test", title: "CR", summary: "x".repeat(201) })
    expect(tooLong.text).toMatch(/^Invalid arguments for .*_write: summary: Too big: expected string to have <=200 characters/)

    const created = await jb.write({
      path: "conseil/cr_test",
      kind: "page",
      title: "CR de test",
      summary: "Compte rendu de test",
      ops: [{ op: "add_section", section: "Décisions", text: "Lancer la pré-étude." }],
    })
    expect(created.text).toMatch(/^Draft of conseil\/cr_test created \(revision 0\): added « Décisions »/)
    const published = await jb.write({ path: "conseil/cr_test", base_revision: 0, publish: true })
    expect(published.text).toBe("Published conseil/cr_test revision 1 (1 sections).")
  })

  it("preuve 6 : révision absente ou périmée refusée avec l'état actuel, rien d'écrit", async () => {
    const claire = await as("claire")
    const missing = await claire.write({ path: "ventes/relance_devis", ops: [{ op: "append", section: "Règles", text: "x" }] })
    expect(missing.isError).toBe(true)
    expect(missing.text).toMatch(/^stale revision: ventes\/relance_devis is at revision 1 and base_revision is missing\. Nothing was written\./)
    expect(missing.text).toContain("- Étapes (")

    const stale = await claire.write({ path: "ventes/relance_devis", base_revision: 0, ops: [{ op: "append", section: "Règles", text: "x" }] })
    expect(stale.text).toMatch(/^stale revision: ventes\/relance_devis is at revision 1, not 0\./)
    const node = (await db.from("nodes").select("draft").eq("id", orgs.seed.nodes["acme/ventes/relance_devis"]).single()).data
    expect(node?.draft).toBeNull()
  })

  it("brouillon, publication, since_revision ; phrases d'une procédure remplacées", async () => {
    const claire = await as("claire")
    const draft = await claire.write({
      path: "ventes/relance_devis",
      base_revision: 1,
      ops: [{ op: "replace_text", section: "Règles", find: "Jamais d'envoi sans accord.", text: "Jamais d'envoi sans accord écrit." }],
      triggers: ["relance les devis en attente", "relance les devis de plus d'une semaine"],
    })
    expect(draft.text).toMatch(/^Draft of ventes\/relance_devis saved on revision 1: edited « Règles »/)

    const pendingRead = await claire.read({ path: "ventes/relance_devis", section: "Règles", draft: true })
    expect(pendingRead.text).toContain("accord écrit")
    expect((await claire.read({ path: "ventes/relance_devis", section: "Règles" })).text).not.toContain("accord écrit")

    const published = await claire.write({ path: "ventes/relance_devis", base_revision: 1, publish: true })
    expect(published.text).toBe("Published ventes/relance_devis revision 2 (3 sections).")

    const changes = await claire.read({ path: "ventes/relance_devis", since_revision: 1 })
    expect(changes.text).toContain("Changes from revision 1 to 2:")
    expect(changes.text).toContain("## Règles (changed)")
    expect(changes.text).not.toContain("## Étapes")

    const phrases = (await db.from("triggers").select("phrase").eq("node_id", orgs.seed.nodes["acme/ventes/relance_devis"]).eq("sense", "trigger")).data ?? []
    expect(phrases.map((t) => t.phrase).sort()).toEqual(["relance les devis de plus d'une semaine", "relance les devis en attente"])
  })

  it("preuve 2 par le produit : publier le guide invalide les ctx en cours", async () => {
    const jb = await as("jb")
    const other = await as("lea")
    const published = await jb.write({ path: "guide", base_revision: 1, ops: [{ op: "append", section: "Règles", text: "Toute remise dépasse 10 % : accord de Claire." }], publish: true })
    expect(published.text).toContain("The organisation's rules changed")
    const res = await other.read({ path: "guide" })
    expect(res.isError).toBe(true)
    expect(res.text).toBe(`context has changed: call ${other.prefix}_context again with the same request, then retry this call.`)
  })
})
