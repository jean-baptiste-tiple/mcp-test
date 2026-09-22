// Le catalogue est la seule source des scénarios : une dérive silencieuse (canari mal placé,
// longueur hors cible, sonde redéfinie, nom tronqué) rendrait toute la campagne de mesure
// ininterprétable APRÈS coup, sur des hosts déjà testés. Ces tests figent le contrat côté
// génération ; le seed, lui, se vérifie contre la base réelle (AC 1 et 2 de la story).
import { describe, expect, it } from "vitest"

import { buildCatalogue, canary, fillText } from "../../scripts/lib/catalogue.mjs"
import type { JsonObject, JsonValue } from "../../scripts/lib/catalogue.mjs"
import { BASELINE, PROBES } from "../../scripts/lib/probes.mjs"

const CANARY_RE = /\[C:([a-z0-9_]+):([a-z0-9_]+):(start|middle|end|only):([0-9a-f]{4})\]/g

const PROBE_NAMES = ["bench_whoami", "bench_echo", "bench_mutate", "bench_readme"]
const ECHO_LEAD =
  "Returns its arguments unchanged. Use this when asked to echo or to test a tool call. Do not use for anything else."

const catalogue = buildCatalogue()
const slugs = catalogue.map((scenario) => scenario.slug)

function bySlug(slug: string) {
  const found = catalogue.find((scenario) => scenario.slug === slug)
  if (!found) throw new Error(`scénario ${slug} absent du catalogue`)
  return found
}

function toolNamed(slug: string, name: string) {
  const found = bySlug(slug).tools.find((tool) => tool.name === name)
  if (!found) throw new Error(`tool ${name} absent de ${slug}`)
  return found
}

function asObject(value: JsonValue, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`chemin ${path} : objet attendu, reçu ${JSON.stringify(value)?.slice(0, 40)}`)
  }
  return value
}

/** Navigation pointée dans un JSON Schema du catalogue. */
function at(root: JsonValue, path: string): JsonValue {
  let current = root
  const walked: string[] = []
  for (const key of path.split(".")) {
    current = asObject(current, walked.join("."))[key]
    walked.push(key)
  }
  return current
}

function objectAt(root: JsonValue, path: string): JsonObject {
  return asObject(at(root, path), path)
}

function canariesOf(text: string) {
  return [...text.matchAll(CANARY_RE)].map((match) => ({
    slug: match[1],
    field: match[2],
    pos: match[3],
    at: match.index ?? -1,
  }))
}

/** Tout texte GÉNÉRÉ long du catalogue, avec sa longueur cible (baseline est recopié, pas généré). */
function longTexts(): { label: string; text: string; target: number }[] {
  const out: { label: string; text: string; target: number }[] = []
  const targetOf = (slug: string, prefix: string) =>
    Number(slug.slice(prefix.length).replace("k", "000"))

  for (const scenario of catalogue) {
    if (scenario.slug === BASELINE.slug) continue
    if (scenario.slug.startsWith("desc_len_")) {
      out.push({
        label: `${scenario.slug}/description`,
        text: scenario.tools[0].description,
        target: targetOf(scenario.slug, "desc_len_"),
      })
    }
    if (scenario.slug.startsWith("instr_len_") && scenario.instructions !== "") {
      out.push({
        label: `${scenario.slug}/instructions`,
        text: scenario.instructions,
        target: targetOf(scenario.slug, "instr_len_"),
      })
    }
    if (typeof scenario.readme_content === "string") {
      out.push({ label: `${scenario.slug}/readme`, text: scenario.readme_content, target: 1500 })
    }
    if (scenario.slug === "schema_shape") {
      for (const tool of scenario.tools) {
        collectDescriptions(tool.input_schema, `${tool.name}`, out)
      }
    }
  }
  return out
}

function collectDescriptions(
  schema: JsonValue,
  path: string,
  out: { label: string; text: string; target: number }[]
) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return
  if (typeof schema.description === "string") {
    out.push({ label: `${path}/description`, text: schema.description, target: 600 })
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key !== "description") collectDescriptions(value, `${path}.${key}`, out)
  }
}

describe("PROBES", () => {
  it("déclare exactement les quatre sondes, dans l'ordre de service", () => {
    expect(PROBES.map((probe) => probe.name)).toEqual(PROBE_NAMES)
    expect(PROBES.map((probe) => probe.handler)).toEqual(["whoami", "echo", "mutate", "readme"])
    expect(PROBES.map((probe) => probe.sort_order)).toEqual([10, 20, 30, 40])
  })

  it("garde la propriété optionnelle note de bench_whoami", () => {
    const [whoami] = PROBES
    expect(whoami.name).toBe("bench_whoami")
    expect(at(whoami.input_schema, "properties.note.type")).toBe("string")
    expect(at(whoami.input_schema, "properties.note.maxLength")).toBe(200)
  })
})

describe("slugs du catalogue", () => {
  it("couvre toutes les familles attendues par le protocole", () => {
    expect(slugs).toEqual(
      expect.arrayContaining([
        "baseline",
        "desc_len_500",
        "desc_len_2k",
        "desc_len_8k",
        "desc_len_32k",
        "name_len_32",
        "name_len_64",
        "name_len_128",
        "name_chars",
        "many_tools_20",
        "many_tools_50",
        "many_tools_100",
        "many_tools_200",
        "many_tools_500",
        "instr_len_0",
        "instr_len_500",
        "instr_len_5k",
        "instr_len_20k",
        "instr_len_50k",
        "server_identity",
        "schema_shape",
        "readme_instructions",
        "readme_descriptions",
        "readme_name_first",
        "readme_gate",
        "readme_ack",
        "readme_hub",
      ])
    )
  })

  it("n'a aucun doublon", () => {
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe("buildCatalogue", () => {
  it("inclut baseline en tête, sans tool généré : le seed le restaure comme les autres", () => {
    const [first] = catalogue
    expect(first.slug).toBe("baseline")
    expect(first.tools).toEqual([])
    expect(first.readme_content).toBe(BASELINE.readme_content)
    expect(first.notes).toBe(BASELINE.notes)
  })

  it("ne redéfinit jamais une sonde dans ses tools générés", () => {
    const generated = catalogue.flatMap((scenario) => scenario.tools.map((tool) => tool.name))
    for (const probe of PROBE_NAMES) expect(generated).not.toContain(probe)
  })

  it("donne des noms de tools uniques à l'intérieur d'un scénario", () => {
    for (const scenario of catalogue) {
      const names = scenario.tools.map((tool) => tool.name)
      expect(new Set(names).size, scenario.slug).toBe(names.length)
    }
  })

  it("place tout tool généré derrière les sondes (sort_order >= 100) et le câble sur echo", () => {
    for (const scenario of catalogue) {
      for (const tool of scenario.tools) {
        expect(tool.sort_order, `${scenario.slug}/${tool.name}`).toBeGreaterThanOrEqual(100)
        expect(tool.handler, `${scenario.slug}/${tool.name}`).toBe("echo")
      }
    }
  })

  it("garde l'identité et les instructions de baseline hors des scénarios qui les mesurent", () => {
    for (const scenario of catalogue) {
      if (scenario.slug === "server_identity" || scenario.slug.startsWith("instr_len_")) continue
      expect(scenario.server_name, scenario.slug).toBe(BASELINE.server_name)
      expect(scenario.server_title, scenario.slug).toBe(BASELINE.server_title)
      expect(scenario.server_version, scenario.slug).toBe(BASELINE.server_version)
      expect(scenario.instructions, scenario.slug).toBe(BASELINE.instructions)
    }
  })

  it("produit deux fois exactement le même JSON", () => {
    expect(JSON.stringify(buildCatalogue())).toBe(JSON.stringify(buildCatalogue()))
  })
})

describe("canaris", () => {
  it("porte exactement trois canaris, un par tiers, dans chaque texte long", () => {
    const texts = longTexts()
    expect(texts.length).toBeGreaterThan(20)

    for (const { label, text } of texts) {
      const found = canariesOf(text)
      expect(found.map((c) => c.pos), label).toEqual(["start", "middle", "end"])
      const third = text.length / 3
      expect(found[0].at, `${label}/start`).toBeLessThan(third)
      expect(found[1].at, `${label}/middle`).toBeGreaterThanOrEqual(third)
      expect(found[1].at, `${label}/middle`).toBeLessThan(2 * third)
      expect(found[2].at, `${label}/end`).toBeGreaterThanOrEqual(2 * third)
    }
  })

  it("nomme le scénario porteur dans chaque canari", () => {
    for (const scenario of catalogue) {
      const texts = [scenario.instructions, scenario.server_title, scenario.readme_content ?? ""]
      for (const tool of scenario.tools) texts.push(tool.description)
      for (const text of texts) {
        for (const found of canariesOf(text)) expect(found.slug).toBe(scenario.slug)
      }
    }
  })

  it("plafonne à 120 caractères toute description à canari unique, au format mcp-patterns §3", () => {
    const short = catalogue
      .flatMap((scenario) => scenario.tools)
      .filter((tool) => canariesOf(tool.description).length === 1)
    expect(short.length).toBeGreaterThan(800)

    for (const tool of short) {
      expect(tool.description.length, `${tool.name} : ${tool.description}`).toBeLessThanOrEqual(120)
      expect(canariesOf(tool.description).map((c) => c.pos), tool.name).toEqual(["only"])
      expect(tool.description, tool.name).toMatch(
        /^Echoes its arguments\. Use this when asked for tool .+\. Do not use otherwise\. \[C:/
      )
    }
  })

  it("ouvre chaque description longue par le format imposé avant le remplissage", () => {
    for (const scenario of catalogue) {
      if (!scenario.slug.startsWith("desc_len_")) continue
      expect(scenario.tools[0].description, scenario.slug).toMatch(
        new RegExp(`^${ECHO_LEAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `)
      )
    }
  })

  it("canary() produit le format exact à partir du tirage du PRNG", () => {
    const rng = () => 0xab / 0x100
    expect(canary("demo_slug", "desc", "middle", rng)).toBe("[C:demo_slug:desc:middle:ab00]")
  })
})

describe("longueurs cibles", () => {
  it("respecte la longueur cible à ±5 % sur chaque texte long", () => {
    for (const { label, text, target } of longTexts()) {
      const drift = Math.abs(text.length - target) / target
      expect(drift, `${label} : ${text.length} pour ${target}`).toBeLessThanOrEqual(0.05)
    }
  })

  it("sert des instructions vides pour instr_len_0", () => {
    expect(bySlug("instr_len_0").instructions).toBe("")
  })

  it("fillText renvoie une chaîne vide pour une cible nulle", () => {
    expect(fillText({ slug: "demo", field: "desc", targetChars: 0, rng: Math.random })).toBe("")
  })
})

describe("noms de tools", () => {
  it.each([32, 64, 128])("name_len_%i porte un nom de N caractères sur [a-z0-9_]", (length) => {
    const [tool] = bySlug(`name_len_${length}`).tools
    expect(tool.name).toHaveLength(length)
    expect(tool.name).toMatch(/^bench_[a-z0-9_]*$/)
  })

  it("name_chars couvre point, tiret, majuscules et unicode", () => {
    expect(bySlug("name_chars").tools.map((tool) => tool.name)).toEqual([
      "bench.dot.tool",
      "bench-dash-tool",
      "BenchUpperTool",
      "bench_ünïcode_tool",
    ])
  })
})

describe("many_tools", () => {
  it.each([20, 50, 100, 200, 500])("many_tools_%i expose N tools bench_gen_001..N", (count) => {
    const { tools } = bySlug(`many_tools_${count}`)
    expect(tools).toHaveLength(count)
    expect(tools[0].name).toBe("bench_gen_001")
    expect(tools[count - 1].name).toBe(`bench_gen_${String(count).padStart(3, "0")}`)
  })

  it("garde la liste de tools de many_tools_500 sous 1,5 Mo", () => {
    const size = JSON.stringify(bySlug("many_tools_500").tools).length
    expect(size).toBeLessThan(1_500_000)
  })
})

describe("schema_shape", () => {
  const scenario = bySlug("schema_shape")
  const deep = toolNamed("schema_shape", "bench_shape_deep")
  const flat = toolNamed("schema_shape", "bench_shape_flat")

  it("expose les deux tools de forme", () => {
    expect(scenario.tools.map((tool) => tool.name)).toEqual(["bench_shape_deep", "bench_shape_flat"])
  })

  it("imbrique bench_shape_deep sur quatre niveaux, avec required à chaque niveau", () => {
    const schema = deep.input_schema
    expect(at(schema, "required")).toEqual(["level1"])
    expect(at(schema, "properties.level1.required")).toEqual(["mode", "level2"])
    expect(at(schema, "properties.level1.properties.level2.required")).toEqual(["level3"])
    expect(at(schema, "properties.level1.properties.level2.properties.level3.required")).toEqual([
      "leaf",
      "items",
    ])
    expect(
      at(schema, "properties.level1.properties.level2.properties.level3.properties.leaf.type")
    ).toBe("string")
  })

  it("porte un enum et un tableau d'objets dans bench_shape_deep", () => {
    const schema = deep.input_schema
    expect(at(schema, "properties.level1.properties.mode.enum")).toEqual(["fast", "slow", "deep"])
    const items = "properties.level1.properties.level2.properties.level3.properties.items"
    expect(at(schema, `${items}.type`)).toBe("array")
    expect(at(schema, `${items}.items.type`)).toBe("object")
    expect(at(schema, `${items}.items.required`)).toEqual(["id"])
    expect(Object.keys(objectAt(schema, `${items}.items.properties`))).toEqual(["id", "weight"])
  })

  it("décrit longuement chaque propriété des deux schémas", () => {
    for (const tool of scenario.tools) {
      const descriptions: { label: string; text: string; target: number }[] = []
      collectDescriptions(tool.input_schema, tool.name, descriptions)
      expect(descriptions.length, tool.name).toBeGreaterThanOrEqual(9)
      for (const { label, text } of descriptions) expect(text.length, label).toBeGreaterThan(500)
    }
  })

  it("donne dix propriétés scalaires décrites à bench_shape_flat", () => {
    const properties = objectAt(flat.input_schema, "properties")
    const keys = Object.keys(properties)
    expect(keys).toHaveLength(10)
    for (const key of keys) {
      expect(["string", "integer", "number", "boolean"], key).toContain(at(properties[key], "type"))
      expect(at(properties[key], "description"), key).toBeTypeOf("string")
    }
  })
})

describe("server_identity", () => {
  it("change les trois champs de serverInfo et marque le title d'un canari", () => {
    const scenario = bySlug("server_identity")
    expect(scenario.server_name).toBe("bench-identity-probe")
    expect(scenario.server_version).toBe("7.7.7")
    expect(scenario.server_title).toMatch(
      /^Bench Identity Probe \[C:server_identity:title:only:[0-9a-f]{4}\]$/
    )
  })
})

describe("scénarios readme", () => {
  const expected: [string, string, number | null][] = [
    ["readme_instructions", "instructions", null],
    ["readme_descriptions", "descriptions", null],
    ["readme_name_first", "name_first", null],
    ["readme_gate", "gate", 1800],
    ["readme_ack", "ack", null],
    ["readme_hub", "hub", null],
  ]

  it.each(expected)("%s pose le levier %s et son TTL", (slug, lever, ttl) => {
    const scenario = bySlug(slug)
    expect(scenario.readme_lever).toBe(lever)
    expect(scenario.ack_ttl_seconds).toBe(ttl)
    expect(scenario.tools).toEqual([])
  })

  it("énonce la règle de citation de l'ack dans chaque readme", () => {
    for (const [slug] of expected) {
      expect(bySlug(slug).readme_content, slug).toContain("quote the ack line back to the user")
    }
  })

  it("laisse readme_lever à none et readme_content nul partout ailleurs (sauf baseline)", () => {
    for (const scenario of catalogue) {
      if (scenario.slug.startsWith("readme_")) continue
      expect(scenario.readme_lever, scenario.slug).toBe("none")
      expect(scenario.ack_ttl_seconds, scenario.slug).toBeNull()
      if (scenario.slug === BASELINE.slug) continue
      expect(scenario.readme_content, scenario.slug).toBeNull()
    }
  })
})
