// Définitions du serveur auth-test (E03-S02) pour deux hôtes branchés dans le même host : noms préfixés,
// descriptions, schémas décrits champ par champ, securitySchemes, serverInfo. Calculé sans base : tout ne
// dépend que de l'organisation de l'hôte.
import { describe, expect, it } from "vitest"

import { buildServerOptions } from "@/auth-test/mcp/server"
import { buildTools, EchoInput, toolKey, WhoamiInput } from "@/auth-test/mcp/tools"
import type { OauthTestOrgRow } from "@/types/oauth-test-database"

import { ACME_ORG as ACME, DELTA_ORG as DELTA } from "../factories/oauth-test.factory"

// Organisation jetable des tests d'intégration : préfixe le plus long que la migration admet (12).
const LONGEST: OauthTestOrgRow = { ...DELTA, slug: "delta-t1a2b", prefix: "deltat1a2bcd" }

describe("outils par hôte", () => {
  for (const org of [ACME, DELTA, LONGEST]) {
    const tools = buildTools(org)

    it(`${org.prefix} : exactement whoami et echo, préfixés, noms ASCII de 64 caractères au plus`, () => {
      expect(tools.map((t) => t.name)).toEqual([`${org.prefix}_whoami`, `${org.prefix}_echo`])
      for (const tool of tools) expect(tool.name).toMatch(/^[a-z0-9_]{1,64}$/)
    })

    it(`${org.prefix} : descriptions en anglais « Use this when… / Do not use… », sous 1 000 caractères, qui nomment l'organisation`, () => {
      for (const tool of tools) {
        expect(tool.description.length, tool.name).toBeLessThan(1000)
        expect(tool.description, tool.name).toContain("Use this when")
        expect(tool.description, tool.name).toContain("Do not use")
        expect(tool.description.split(". ")[0], tool.name).toContain(org.name)
        expect(tool.title.startsWith(`${org.name}: `), tool.name).toBe(true)
      }
    })

    it(`${org.prefix} : chaque champ décrit, schémas plats`, () => {
      for (const tool of tools) {
        expect(tool.inputSchema.type, tool.name).toBe("object")
        expect(tool.inputSchema).not.toHaveProperty("$schema")
        const properties = tool.inputSchema.properties as Record<string, { type?: string; description?: string }>
        expect(Object.keys(properties).length, tool.name).toBeGreaterThan(0)
        for (const [field, schema] of Object.entries(properties)) {
          expect(schema.description, `${tool.name}.${field}`).toBeTruthy()
          expect(["object", "array"], `${tool.name}.${field}`).not.toContain(schema.type)
        }
      }
    })

    it(`${org.prefix} : securitySchemes oauth2 dans _meta, annotations de lecture`, () => {
      for (const tool of tools) {
        expect(tool._meta, tool.name).toEqual({ securitySchemes: [{ type: "oauth2" }] })
        expect(tool.annotations, tool.name).toEqual({ readOnlyHint: true, idempotentHint: true, openWorldHint: false })
      }
    })
  }

  it("aucun nom commun entre Acme et Delta", () => {
    const acme = new Set(buildTools(ACME).map((t) => t.name))
    expect(buildTools(DELTA).filter((t) => acme.has(t.name))).toEqual([])
  })

  it("echo exige message et accepte des champs libres ; whoami : note facultative", () => {
    const [whoami, echo] = buildTools(ACME)
    expect(echo.inputSchema.required).toEqual(["message"])
    expect(echo.inputSchema.additionalProperties).toEqual({})
    expect(whoami.inputSchema.required ?? []).toEqual([])
    expect(EchoInput.safeParse({ message: "x", extra: { a: 1 } }).data).toEqual({ message: "x", extra: { a: 1 } })
    expect(EchoInput.safeParse({ extra: 1 }).success).toBe(false)
    expect(WhoamiInput.safeParse({}).success).toBe(true)
    expect(WhoamiInput.safeParse({ note: "x".repeat(201) }).success).toBe(false)
  })

  it("toolKey ne reconnaît que les outils du préfixe", () => {
    expect(toolKey("acme", "acme_whoami")).toBe("whoami")
    expect(toolKey("acme", "acme_echo")).toBe("echo")
    expect(toolKey("acme", "delta_whoami")).toBeNull()
    expect(toolKey("acme", "acme_delete")).toBeNull()
    expect(toolKey("acme", "acme_")).toBeNull()
  })
})

describe("buildServerOptions", () => {
  it("serverInfo par organisation, instructions d'une phrase qui nomment les deux outils", () => {
    for (const org of [ACME, DELTA]) {
      const options = buildServerOptions(org)
      expect(options.serverInfo).toEqual({ name: `${org.slug}-auth-test`, title: `${org.name} (auth test)`, version: "1.0.0" })
      expect(options.instructions.split(/\.\s/)).toHaveLength(1)
      expect(options.instructions).toContain(`${org.prefix}_whoami`)
      expect(options.instructions).toContain(`${org.prefix}_echo`)
      expect(options.capabilities).toEqual({ tools: {} })
    }
  })
})
