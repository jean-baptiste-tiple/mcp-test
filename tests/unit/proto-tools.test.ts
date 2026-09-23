// Preuve 8 (E04-S01) : noms, descriptions et schémas des six outils, pour deux clients branchés
// dans le même host. Calculé sans base : les définitions ne dépendent que de l'organisation.
import { describe, expect, it } from "vitest"

import { renderContext } from "@/proto/services/context"
import { initializeEntries } from "@/proto/services/journal"
import { buildTools, prerequisite, serverInstructions, toolKey } from "@/proto/mcp/tools"

import { PROTO_ORGS } from "../../scripts/lib/proto-data.mjs"

const ACME = { prefix: "acme", name: "Acme Énergies", domains: "sales, customer support, energy consulting" }
const DELTA = { prefix: "delta", name: "Delta Logistique", domains: null }

describe("six outils par client (preuve 8)", () => {
  for (const org of [ACME, DELTA]) {
    const tools = buildTools(org)

    it(`${org.prefix} : exactement six outils préfixés, noms ASCII de 64 caractères au plus`, () => {
      expect(tools.map((t) => t.name)).toEqual(
        ["context", "find", "read", "call", "write", "feedback"].map((k) => `${org.prefix}_${k}`)
      )
      for (const tool of tools) expect(tool.name).toMatch(/^[a-z0-9_]{1,64}$/)
    })

    it(`${org.prefix} : descriptions de moins de 1 000 caractères`, () => {
      for (const tool of tools) expect(tool.description.length, tool.name).toBeLessThan(1000)
    })

    it(`${org.prefix} : les cinq outils autres que context exigent ctx, en première phrase et dans le schéma`, () => {
      for (const tool of tools.filter((t) => !t.name.endsWith("_context"))) {
        expect(tool.description.startsWith(prerequisite(org.prefix) + " "), tool.name).toBe(true)
        expect(tool.inputSchema.required, tool.name).toContain("ctx")
      }
      const context = tools.find((t) => t.name.endsWith("_context"))!
      expect(context.inputSchema.required ?? []).not.toContain("ctx")
    })

    it(`${org.prefix} : schémas plats, hors write.ops et call.arguments`, () => {
      for (const tool of tools) {
        const properties = tool.inputSchema.properties as Record<string, { type?: string }>
        for (const [field, schema] of Object.entries(properties)) {
          const nested = schema.type === "object" || schema.type === "array"
          const allowed = `${tool.name}.${field}` === `${org.prefix}_write.ops` || `${tool.name}.${field}` === `${org.prefix}_call.arguments`
          const scalarArray = schema.type === "array" && ["triggers", "neighbors"].includes(field)
          if (nested && !allowed && !scalarArray) throw new Error(`${tool.name}.${field} est imbriqué`)
        }
      }
    })
  }

  it("aucun nom commun entre Acme et Delta", () => {
    const acme = new Set(buildTools(ACME).map((t) => t.name))
    expect(buildTools(DELTA).filter((t) => acme.has(t.name))).toEqual([])
  })

  it("la description de context nomme les domaines seulement quand l'organisation en a", () => {
    expect(buildTools(ACME)[0].description).toContain("energy consulting")
    expect(buildTools(DELTA)[0].description.startsWith("Loads your work context at Delta Logistique and routes")).toBe(true)
  })

  it("instructions serveur : une seule phrase qui renvoie à context", () => {
    const text = serverInstructions(ACME)
    expect(text).toContain("acme_context first")
    expect(text.split(/\.\s/)).toHaveLength(1)
  })

  it("toolKey ne reconnaît que les outils du préfixe", () => {
    expect(toolKey("acme", "acme_find")).toBe("find")
    expect(toolKey("acme", "delta_find")).toBeNull()
    expect(toolKey("acme", "acme_delete")).toBeNull()
  })
})

describe("données fictives", () => {
  it("la page longue conseil/methode_etude a au moins 12 sections et plus de 25 000 caractères", () => {
    const page = PROTO_ORGS[0].nodes.find((n) => n.path === "conseil/methode_etude")!
    expect(page.sections.length).toBeGreaterThanOrEqual(12)
    expect(page.sections.reduce((n, s) => n + s.title.length + s.body.length, 0)).toBeGreaterThan(25_000)
  })

  it("Acme : 10 procédures, chacune avec 4 à 6 déclencheuses et 2 à 3 voisines", () => {
    const procedures = PROTO_ORGS[0].nodes.filter((n) => n.kind === "procedure")
    expect(procedures).toHaveLength(10)
    for (const p of procedures) {
      expect(p.triggers!.length, p.path).toBeGreaterThanOrEqual(4)
      expect(p.triggers!.length, p.path).toBeLessThanOrEqual(6)
      expect(p.neighbors!.length, p.path).toBeGreaterThanOrEqual(2)
      expect(p.neighbors!.length, p.path).toBeLessThanOrEqual(3)
    }
  })
})

describe("journal d'initialize", () => {
  it("un message, un lot, un corps illisible", () => {
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "claude-ai", version: "0.1.0" } } }
    expect(initializeEntries(JSON.stringify(init))).toEqual(["claude-ai@0.1.0"])
    expect(initializeEntries(JSON.stringify([init, { jsonrpc: "2.0", method: "notifications/initialized" }]))).toEqual(["claude-ai@0.1.0"])
    expect(initializeEntries(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).toEqual([])
    expect(initializeEntries("{pas du json")).toEqual([])
    expect(initializeEntries(JSON.stringify({ method: "initialize", params: {} }))).toEqual(["?@?"])
  })
})

describe("budget de context (preuve 3)", () => {
  const blocks = [
    { name: "code", text: "ctx: AAAA-BBBB\nPass this ctx to every acme_ tool." },
    { name: "person", text: "## You work for\n" + "p".repeat(300) },
    { name: "organisation", text: "## Organisation\n" + Array.from({ length: 20 }, (_, i) => `ligne ${i} `.repeat(8)).join("\n") },
    { name: "procedures", text: "## Procedures\n" + "x".repeat(2000) },
    { name: "topics", text: "## By topic\n- tarifs: conseil/grille" },
  ]

  it("tout tient : rien n'est omis", () => {
    const text = renderContext(blocks, 20_000, "acme")
    expect(text).toContain("## By topic")
    expect(text).not.toContain("budget reached")
  })

  it("budget réduit : code entier, blocs de fin omis d'abord, ligne finale qui les nomme", () => {
    const text = renderContext(blocks, 1500, "acme")
    expect(text.length).toBeLessThanOrEqual(1500)
    expect(text.startsWith(blocks[0].text)).toBe(true)
    expect(text).toContain("## You work for")
    expect(text).toContain("\n\n## Organisation")
    expect(text).not.toContain("## Procedures")
    expect(text).toMatch(/Omitted: organisation \(cut\), procedures, topics\./)
  })
})
