// @vitest-environment node
// Preuves 6 (table.write refuse null) et 7 (sensible sans confirmation, hors droits) et le reste du
// contrat de call (E04-S04), contre le Postgres du banc, sur des organisations jetables.
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { ProtoDb } from "@/proto/db"
import { NULL_REFUSED } from "@/proto/functions/table"

import { connectAs, hasDb, INTEGRATION_TIMEOUT, seedTestOrgs, SKIP_REASON, testDb, type TestOrgs } from "./proto-helpers"

const TABLE = "ventes/suivi_prospects"

describe.skipIf(!hasDb)(`serveur proto — call${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: ProtoDb
  let orgs: TestOrgs

  beforeAll(async () => {
    db = testDb()
    orgs = await seedTestOrgs(db)
  }, 60_000)

  afterAll(async () => {
    await orgs?.drop()
  }, 60_000)

  /** Session ouverte : client connecté et code ctx. */
  async function as(user: string) {
    const session = await connectAs(db, orgs.seed.users[user].slug)
    const { code } = await session.openContext()
    const call = (fn: string, args: Record<string, unknown> = {}, confirm?: boolean) =>
      session.call("call", { ctx: code, function: fn, arguments: args, ...(confirm === undefined ? {} : { confirm }) })
    return { ...session, code, callFn: call }
  }

  it("fonction inconnue ou arguments invalides : refus actionnable", async () => {
    const jb = await as("jb")
    const unknown = await jb.callFn("sellsy.delete_everything")
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toBe(`Unknown function sellsy.delete_everything. Use ${jb.prefix}_find with type function.`)
    const invalid = await jb.callFn("sellsy.get_estimate", {})
    expect(invalid.isError).toBe(true)
    expect(invalid.text).toMatch(/^Invalid arguments for sellsy\.get_estimate: id: .*Read the contract with .*_read \{"path": "sellsy\.get_estimate"\}\.$/)
  })

  it("preuve 7 : fonction hors droits → refus nommant l'équipe et son responsable", async () => {
    const paul = await as("paul")
    const res = await paul.callFn("sellsy.list_estimates")
    expect(res.isError).toBe(true)
    expect(res.text).toBe("sellsy (read) is open to team Ventes (lead: Claire Morel), not to your teams. Ask them for access.")
    const claire = await as("claire")
    expect((await claire.callFn("probe.payload", { chars: 10 })).text).toMatch(/^probe \(read\) is open to team Conseil/)
  })

  it("sellsy simulé : quatre devis envoyés depuis 7 jours ou plus, détail d'un devis", async () => {
    const jb = await as("jb")
    const list = await jb.callFn("sellsy.list_estimates", { status: "sent", older_than_days: 7 })
    expect(list.text.split("\n")[0]).toBe("4 estimate(s):")
    const one = await jb.callFn("sellsy.get_estimate", { id: "dev-2026-046" })
    expect(one.text).toContain("Total : 7 500 € HT")
    const missing = await jb.callFn("sellsy.get_estimate", { id: "DEV-1" })
    expect(missing.text).toMatch(/^Unknown estimate DEV-1\. Existing: DEV-2026-041/)
  })

  it("preuve 7 : mail.send_draft sans confirm → récapitulatif, rien d'envoyé ; avec confirm → envoyé", async () => {
    const jb = await as("jb")
    const draft = await jb.callFn("mail.create_draft", { to: "sophie@valbrune.test", subject: "Votre devis DEV-2026-041", body: "Bonjour Sophie, avez-vous pu lire le devis ?" })
    const id = /Draft (dr_[0-9a-f]{8}) saved/.exec(draft.text)![1]

    const summary = await jb.callFn("mail.send_draft", { id })
    expect(summary.isError).toBe(false)
    expect(summary.text).toContain("To: sophie@valbrune.test")
    expect(summary.text).toContain("Nothing was sent. Show this to the user and ask for explicit approval, then call again with confirm: true.")
    expect((await db.from("mail_drafts").select("status").eq("id", id).single()).data?.status).toBe("draft")

    const sent = await jb.callFn("mail.send_draft", { id }, true)
    expect(sent.text).toMatch(/^Draft dr_[0-9a-f]{8} sent to sophie@valbrune\.test/)
    expect((await db.from("mail_drafts").select("status").eq("id", id).single()).data?.status).toBe("sent")
    expect((await jb.callFn("mail.send_draft", { id }, true)).text).toMatch(/was already sent/)
  })

  it("preuve 6 : table.write refuse null et dit pourquoi ; types, colonnes, provenance", async () => {
    const jb = await as("jb")
    const res = await jb.callFn("table.write", {
      table: TABLE,
      rows: [{ key: "P-001", revision: 1, set: { notes: "Rappeler en octobre", contact: null, montant_estime: "12000", statut: "inconnu", couleur: "bleu" } }],
    })
    expect(res.isError).toBe(false)
    expect(res.text).toContain("P-001 → revision 2: set notes")
    expect(res.text).toContain(`contact: ${NULL_REFUSED}`)
    expect(res.text).toContain("montant_estime: expected a number (not a string)")
    expect(res.text).toContain("statut: expected one of:")
    expect(res.text).toContain("couleur: unknown column")

    const row = (await db.from("rows").select("values, provenance, revision").eq("key", "P-001").eq("node_id", orgs.seed.nodes[`acme/${TABLE}`]).single()).data!
    expect(row.revision).toBe(2)
    expect((row.values as Record<string, unknown>).contact).toBe("Marion Vasseur")
    expect((row.provenance as Record<string, { origin: string }>).notes.origin).toBe("agent")
  })

  it("preuve 6 : révision périmée refusée avec la ligne actuelle ; verified_empty et clear", async () => {
    const jb = await as("jb")
    const stale = await jb.callFn("table.write", { table: TABLE, rows: [{ key: "P-002", revision: 9, set: { notes: "x" } }] })
    expect(stale.text).toMatch(/^P-002: refused, stale revision 9; current is:\n {2}- P-002 \(rev 1\)/)
    const ok = await jb.callFn("table.write", {
      table: TABLE,
      rows: [{ key: "P-002", revision: 1, verified_empty: [{ column: "email", reason: "Aucune adresse publique" }], clear: ["ville"] }],
    })
    expect(ok.text).toBe("P-002 → revision 2: clear ville, verified_empty email.")
  })

  it("table.write hors droits : refus nommant l'équipe propriétaire", async () => {
    const paul = await as("paul")
    const res = await paul.callFn("table.write", { table: TABLE, rows: [{ key: "P-003", set: { notes: "x" } }] })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/is reserved to team Ventes \(lead: Claire Morel\)/)
  })

  it("file de travail : deux claims ne rendent jamais la même ligne ; release par un autre travailleur refusé", async () => {
    const claire = await as("claire")
    const first = await claire.callFn("table.claim", { table: TABLE, worker: "w1", limit: 2 })
    const second = await claire.callFn("table.claim", { table: TABLE, worker: "w2", limit: 2 })
    const keys = (text: string) => [...text.matchAll(/^- (P-\d{3})/gm)].map((m) => m[1])
    expect(keys(first.text)).toHaveLength(2)
    expect(keys(second.text)).toHaveLength(2)
    expect(keys(first.text).filter((k) => keys(second.text).includes(k))).toEqual([])

    const [taken] = keys(first.text)
    const wrong = await claire.callFn("table.release", { table: TABLE, key: taken, worker: "w2", state: "relancé" })
    expect(wrong.text).toBe(`${taken} is claimed by w1, not w2.`)
    const done = await claire.callFn("table.release", { table: TABLE, key: taken, worker: "w1", state: "relancé" })
    expect(done.text).toMatch(new RegExp(`^${taken} released → « relancé »`))
  })

  it("table.rows (filtre, projection, curseur), table.aggregate, table.schema", async () => {
    const lea = await as("lea")
    const page = await lea.callFn("table.rows", { table: TABLE, columns: ["entreprise"], limit: 5 })
    expect(page.text).toMatch(/^ventes\/suivi_prospects: 12 row\(s\) match\./)
    expect(page.text).toContain("next_cursor: P-005")
    const next = await lea.callFn("table.rows", { table: TABLE, columns: ["entreprise"], limit: 5, cursor: "P-005" })
    expect(next.text).toContain("- P-006 ")
    const filtered = await lea.callFn("table.rows", { table: TABLE, filter: { ville: "Valbrune" } })
    expect(filtered.text).toMatch(/: 3 row\(s\) match/)
    const counts = await lea.callFn("table.aggregate", { table: TABLE, group_by: "statut", sum: "montant_estime" })
    expect(counts.text).toContain("12 row(s) by statut")
    const schema = await lea.callFn("table.schema", { table: TABLE })
    expect(schema.text).toContain("State column: statut")
  })

  it("sondes : probe.payload rend exactement N caractères avec canaris ; probe.echo mesure", async () => {
    const jb = await as("jb")
    const payload = await jb.callFn("probe.payload", { chars: 2500 })
    expect(payload.text).toHaveLength(2500)
    expect(payload.text.match(/\[C:proto:\d{6}\]/g)).toEqual(["[C:proto:000000]", "[C:proto:001000]", "[C:proto:002000]"])
    const echo = await jb.callFn("probe.echo", { text: payload.text })
    expect(echo.text).toContain("Received 2500 characters.")
    expect(echo.text).toContain("Canaries: 3 (first [C:proto:000000], last [C:proto:002000])")
  })

  it("claims concurrents : jamais la même ligne ; l'état de travail ne se pose que par claim", async () => {
    const lea = await as("lea")
    const results = await Promise.all(["c1", "c2", "c3"].map((worker) => lea.callFn("table.claim", { table: TABLE, worker, limit: 1 })))
    const keys = results.flatMap((r) => [...r.text.matchAll(/^- (P-\d{3})/gm)].map((m) => m[1]))
    expect(new Set(keys).size).toBe(keys.length)

    const forced = await lea.callFn("table.write", { table: TABLE, rows: [{ key: "P-012", set: { statut: "en cours" } }] })
    expect(forced.text).toContain("statut: « en cours » is set by table.claim, with a lease")
  })

  it("clé d'argument inconnue refusée (et non ignorée) ; la cible reste au journal sur un refus", async () => {
    const lea = await as("lea")
    const typo = await lea.callFn("table.rows", { table: TABLE, filters: { ville: "Valbrune" } })
    expect(typo.isError).toBe(true)
    expect(typo.text).toMatch(/^Invalid arguments for table\.rows: .*filters/)
    expect(lea.journal.at(-1)).toMatchObject({ target: "table.rows", is_error: true })
  })

  it("find type function : le catalogue se cherche par ses mots, avec le chemin vers read puis call", async () => {
    const jb = await as("jb")
    const found = await jb.call("find", { ctx: jb.code, query: "list estimates devis", type: "function" })
    expect(found.text).toMatch(/^Top functions for « list estimates devis »:\n1\. sellsy\./)
    expect(found.text).toMatch(/^\d\. sellsy\.list_estimates \(read, score/m)
    expect(found.text).toContain(`${jb.prefix}_read {"path": "<function>"}`)
    expect((await jb.call("find", { ctx: jb.code, query: "zzz", type: "function" })).text).toContain("No function matches")
  })

  it("slack simulé ; journal : cible = fonction, équipe sous laquelle l'appel a couru ; preuve 5", async () => {
    const jb = await as("jb")
    const posted = await jb.callFn("slack.post_message", { channel: "#ventes", text: "Point pipeline" })
    expect(posted.text).toBe("Posted to #ventes, 14 characters (simulated connector: nothing left the server).")
    expect((posted.result.structuredContent as { text: string }).text).toBe(posted.text)
    const entry = jb.journal.at(-1)!
    expect(entry.target).toBe("slack.post_message")
    expect(entry.team_id).toBe(orgs.seed.teams["acme/conseil"].id)
  })
})
