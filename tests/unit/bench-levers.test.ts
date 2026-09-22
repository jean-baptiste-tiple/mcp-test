// Leviers readme : la seule chose qui sépare deux scénarios est la transformation appliquée
// ici. Un levier qui déborde sur le tool readme, ou qui mute le snapshot, fausse la mesure.
import { describe, expect, it } from "vitest"

import {
  applyLever,
  README_FIRST_NAME,
  requiresAck,
  requiresGate,
  resolveToolRow,
} from "@/mcp/bench/levers"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"

import { makeScenario, makeTool } from "../factories/bench.factory"

const INSTRUCTIONS = "MCP Bench: a test server."

async function snapshotWith(lever: string) {
  return loadSnapshot(
    new MemoryBenchRepository(
      makeScenario({ readme_lever: lever, instructions: INSTRUCTIONS, readme_content: "Read me." }),
      [
        makeTool({
          name: "bench_echo",
          sort_order: 20,
          description: "Returns its arguments unchanged.",
          input_schema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        }),
        makeTool({
          name: "bench_readme",
          handler: "readme",
          sort_order: 40,
          description: "Returns the readme of this scenario.",
        }),
      ]
    )
  )
}

/** Référence : la même fixture servie sous le levier neutre. */
async function servedWithoutLever() {
  return applyLever(await snapshotWith("none")).tools
}

describe("applyLever", () => {
  it("none : identité sur les tools et sur les instructions", async () => {
    const snapshot = await snapshotWith("none")

    const served = applyLever(snapshot)

    expect(served.tools).toEqual(await servedWithoutLever())
    expect(served.instructions).toBe(INSTRUCTIONS)
  })

  it("une valeur hors check retombe sur none", async () => {
    const snapshot = await snapshotWith("inconnue")

    expect(applyLever(snapshot).tools).toEqual(await servedWithoutLever())
  })

  it("instructions : préfixe exact, ligne vide, puis les instructions du scénario", async () => {
    const snapshot = await snapshotWith("instructions")

    const served = applyLever(snapshot)

    expect(served.instructions).toBe(
      "ALWAYS call bench_readme before any other tool of this server, once per conversation.\n\n" +
        INSTRUCTIONS
    )
    expect(served.tools).toEqual(await servedWithoutLever())
  })

  it("descriptions : préfixe sur les tools non-readme uniquement", async () => {
    const { tools } = applyLever(await snapshotWith("descriptions"))

    expect(tools[0].description).toBe(
      "Requires bench_readme first (call it once per conversation before this tool). " +
        "Returns its arguments unchanged."
    )
    expect(tools[1].description).toBe("Returns the readme of this scenario.")
  })

  it("hub : descriptions non-readme réduites au renvoi vers bench_readme", async () => {
    const { tools } = applyLever(await snapshotWith("hub"))

    expect(tools[0].description).toBe("bench_echo: see bench_readme for usage.")
    expect(tools[1].description).toBe("Returns the readme of this scenario.")
  })

  it("name_first : readme renommé et servi en première position", async () => {
    const { tools } = applyLever(await snapshotWith("name_first"))

    expect(tools.map((tool) => tool.name)).toEqual([README_FIRST_NAME, "bench_echo"])
    expect(tools[0].description).toBe("Returns the readme of this scenario.")
  })

  it("ack : propriété ack ajoutée aux properties ET aux required des tools non-readme", async () => {
    const { tools } = applyLever(await snapshotWith("ack"))

    expect(tools[0].inputSchema.properties).toEqual({
      message: { type: "string" },
      ack: { type: "string", description: "Value returned by bench_readme; call it first" },
    })
    expect(tools[0].inputSchema.required).toEqual(["message", "ack"])
    expect(tools[1].inputSchema.required).toBeUndefined()
  })

  it("ack : laisse le schéma servi intact, y compris un schéma sans type", async () => {
    const snapshot = await loadSnapshot(
      new MemoryBenchRepository(makeScenario({ readme_lever: "ack" }), [
        // Schéma volontairement non conforme : le servir tel quel EST le scénario.
        makeTool({ name: "bench_odd", input_schema: { title: "Sans type" } }),
      ])
    )

    const [tool] = applyLever(snapshot).tools

    expect(tool.inputSchema).toEqual({
      title: "Sans type",
      properties: { ack: { type: "string", description: "Value returned by bench_readme; call it first" } },
      required: ["ack"],
    })
    expect(tool.inputSchema).not.toHaveProperty("type")
  })

  it("ack : ne mute pas les lignes du snapshot", async () => {
    const snapshot = await snapshotWith("ack")

    applyLever(snapshot)

    expect(snapshot.tools[0].input_schema).toEqual({
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    })
  })

  it("gate : liste et instructions inchangées (le contrôle est au tools/call)", async () => {
    const snapshot = await snapshotWith("gate")

    const served = applyLever(snapshot)

    expect(served.tools).toEqual(await servedWithoutLever())
    expect(served.instructions).toBe(INSTRUCTIONS)
  })
})

describe("requiresAck / requiresGate", () => {
  it("ne sont vrais que pour leur propre levier", () => {
    expect([requiresAck("ack"), requiresAck("gate"), requiresAck("none")]).toEqual([
      true,
      false,
      false,
    ])
    expect([requiresGate("gate"), requiresGate("ack"), requiresGate("none")]).toEqual([
      true,
      false,
      false,
    ])
  })
})

describe("resolveToolRow", () => {
  it("résout le nom servi bench_00_readme sous name_first", async () => {
    const snapshot = await snapshotWith("name_first")

    expect(resolveToolRow(snapshot, README_FIRST_NAME)?.handler).toBe("readme")
  })

  it("ne résout pas bench_00_readme sous un autre levier", async () => {
    const snapshot = await snapshotWith("none")

    expect(resolveToolRow(snapshot, README_FIRST_NAME)).toBeNull()
  })

  it("résout un nom de ligne tel quel", async () => {
    const snapshot = await snapshotWith("none")

    expect(resolveToolRow(snapshot, "bench_echo")?.name).toBe("bench_echo")
    expect(resolveToolRow(snapshot, "ghost")).toBeNull()
  })
})
