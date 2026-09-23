// @vitest-environment node
// Preuve 4 (E04-S02) : routage lexical sur le jeu de phrases de test, contre le Postgres du banc
// (orgs jetables). Imprime précision, rappel des paraphrases et exactitude du premier candidat.
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { ProtoDb } from "@/proto/db"
import { type Identity, resolveIdentity } from "@/proto/identity"
import { decide, rankCandidates } from "@/proto/services/routing"

import { PROTO_ORGS, type ProtoOrgData } from "../../scripts/lib/proto-data.mjs"
import { connectAs, hasDb, INTEGRATION_TIMEOUT, seedTestOrgs, SKIP_REASON, testDb, type TestOrgs } from "./proto-helpers"
import { ACME_AMBIGUOUS, ACME_NEGATIVES, ACME_PARAPHRASES, DELTA_PARAPHRASES, type RoutingCase } from "./proto-routing.cases"

/** Phrases stockées : chaque déclencheuse doit servir sa procédure ; une voisine jamais la sienne. */
function storedCases(org: ProtoOrgData): RoutingCase[] {
  const triggerOf = new Map<string, string>()
  for (const n of org.nodes) for (const t of n.triggers ?? []) triggerOf.set(t, n.path)
  return org.nodes.flatMap((n) => [
    ...(n.triggers ?? []).map((phrase) => ({ phrase, expect: n.path, kind: "trigger" as const })),
    ...(n.neighbors ?? []).map((phrase) => ({ phrase, expect: triggerOf.get(phrase), forbid: [n.path], kind: "neighbor" as const })),
  ])
}

type Outcome = RoutingCase & { top: string | null; served: string | null }

async function route(db: ProtoDb, identity: Identity, cases: RoutingCase[]): Promise<Outcome[]> {
  return Promise.all(
    cases.map(async (c) => {
      const candidates = await rankCandidates(db, identity, c.phrase, "procedure", 3)
      return { ...c, top: candidates[0]?.path ?? null, served: decide(candidates)?.path ?? null }
    })
  )
}

function report(label: string, outcomes: Outcome[]) {
  const served = outcomes.filter((o) => o.served)
  const correct = served.filter((o) => (o.expect === undefined ? !(o.forbid ?? []).includes(o.served!) : o.served === o.expect))
  const paraphrases = outcomes.filter((o) => o.kind === "paraphrase")
  const expected = outcomes.filter((o) => o.expect)
  const metrics = {
    phrases: outcomes.length,
    served: served.length,
    precision: served.length ? correct.length / served.length : 1,
    paraphraseRecall: paraphrases.filter((o) => o.served === o.expect).length / Math.max(1, paraphrases.length),
    top1: expected.filter((o) => o.top === o.expect).length / Math.max(1, expected.length),
  }
  console.log(
    `[routage ${label}] ${metrics.phrases} phrases, ${metrics.served} servies, précision ${(metrics.precision * 100).toFixed(1)} %, ` +
      `paraphrases servies ${(metrics.paraphraseRecall * 100).toFixed(1)} %, premier candidat juste ${(metrics.top1 * 100).toFixed(1)} %`
  )
  for (const o of served.filter((x) => !correct.includes(x))) console.log(`  ✗ ${o.kind} « ${o.phrase} » → ${o.served}`)
  for (const o of paraphrases.filter((x) => x.served !== x.expect)) console.log(`  · non servie : « ${o.phrase} » (premier candidat ${o.top})`)
  return metrics
}

describe.skipIf(!hasDb)(`serveur proto — routage${hasDb ? "" : ` (${SKIP_REASON})`}`, { timeout: INTEGRATION_TIMEOUT }, () => {
  let db: ProtoDb
  let orgs: TestOrgs
  let acme: Identity
  let delta: Identity

  beforeAll(async () => {
    db = testDb()
    orgs = await seedTestOrgs(db)
    acme = (await resolveIdentity(db, orgs.seed.users.jb.slug))!
    delta = (await resolveIdentity(db, orgs.seed.users["jb-delta"].slug))!
  }, 60_000)

  afterAll(async () => {
    await orgs?.drop()
  }, 60_000)

  it("preuve 4 — Acme : ≥ 95 % de bonnes reconnaissances servies, aucune voisine ni phrase hors procédure servie", async () => {
    const outcomes = await route(db, acme, [...storedCases(PROTO_ORGS[0]), ...ACME_PARAPHRASES, ...ACME_NEGATIVES, ...ACME_AMBIGUOUS])
    const metrics = report("Acme", outcomes)
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95)
    for (const o of outcomes.filter((x) => x.kind === "neighbor")) expect(o.forbid, o.phrase).not.toContain(o.served)
    for (const o of outcomes.filter((x) => x.kind === "negative" || x.kind === "ambiguous")) expect(o.served, o.phrase).toBeNull()
    for (const o of outcomes.filter((x) => x.kind === "trigger")) expect(o.served, o.phrase).toBe(o.expect)
    expect(metrics.paraphraseRecall).toBeGreaterThanOrEqual(0.8)
  }, 60_000)

  it("preuve 4 — Delta : mêmes règles sur un autre domaine", async () => {
    const outcomes = await route(db, delta, [...storedCases(PROTO_ORGS[1]), ...DELTA_PARAPHRASES])
    const metrics = report("Delta", outcomes)
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95)
    for (const o of outcomes.filter((x) => x.kind === "neighbor")) expect(o.forbid, o.phrase).not.toContain(o.served)
  }, 60_000)

  it("vocabulaire : un synonyme absent de toutes les phrases (« PdV ») apporte les lexèmes de son terme (prospect)", async () => {
    const lexical = async (query: string) => {
      const rows = (await db.rpc("route_candidates", { p_org: acme.org.id, p_query: query, p_kind: "procedure" })).data ?? []
      return rows.find((r) => r.path === "ventes/relance_prospects")?.lexical ?? 0
    }
    expect(await lexical("PdV")).toBeGreaterThan(0)
    expect(await lexical("xyzw")).toBe(0)
    const [top] = await rankCandidates(db, acme, "relance les PdV", "procedure", 3)
    expect(top?.path).toBe("ventes/relance_prospects")
  })

  it("lecture filtrée : un membre de Support ne se voit jamais proposer une procédure de Ventes", async () => {
    const paul = (await resolveIdentity(db, orgs.seed.users.paul.slug))!
    const candidates = await rankCandidates(db, paul, "relance les devis en attente", "procedure", 3)
    expect(candidates.every((c) => !c.path.startsWith("ventes/"))).toBe(true)
  })

  it("context : étapes complètes servies, candidats suivants visibles ; sinon consigne de demander", async () => {
    const session = await connectAs(db, orgs.seed.users.jb.slug)
    const clear = await session.call("context", { phrase: "relance les devis en attente" })
    expect(clear.text).toContain("matches ventes/relance_devis")
    expect(clear.text).toContain("## Procedure ventes/relance_devis (v1)")
    expect(clear.text).toContain("sellsy.list_estimates")
    expect(clear.text).toContain("Other candidates:")

    const ambiguous = await session.call("context", { phrase: "prospects" })
    expect(ambiguous.text).toContain("no clear match. Candidates:")
    expect(ambiguous.text).toContain("Ask the user which procedure they mean; do not guess.")
    expect(ambiguous.text).not.toContain("## Procedure ")

    const none = await session.call("context", { phrase: "donne-moi une recette de crêpes" })
    expect(none.text).toContain("no procedure matches")
    expect(none.text).not.toContain("## Procedure ")

    for (const res of [clear, ambiguous, none]) expect((res.result.structuredContent as { text: string }).text).toBe(res.text)
    expect(session.journal.map((e) => e.target)).toEqual(["ventes/relance_devis", "prospects", "donne-moi une recette de crêpes"])
  })

  it("find : trois candidats au plus, par type ; preuve 5", async () => {
    const session = await connectAs(db, orgs.seed.users.jb.slug)
    const { code } = await session.openContext()
    const pages = await session.call("find", { ctx: code, query: "grille tarifaire", type: "page" })
    expect(pages.text).toMatch(/^Top matches for « grille tarifaire »:\n1\. conseil\/grille_tarifaire_2026 \(page/)
    const tables = await session.call("find", { ctx: code, query: "suivi des prospects", type: "table" })
    expect(tables.text).toContain("1. ventes/suivi_prospects (table")
    const any = await session.call("find", { ctx: code, query: "relance devis" })
    expect(any.text.match(/^\d\. /gm)!.length).toBeLessThanOrEqual(3)
    const nothing = await session.call("find", { ctx: code, query: "zzz qqq www" })
    expect(nothing.text).toContain("No match")
    for (const res of [pages, tables, any, nothing]) expect((res.result.structuredContent as { text: string }).text).toBe(res.text)
  })
})
