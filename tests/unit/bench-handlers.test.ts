// Les trois sondes, appelées directement : ce qu'elles RENDENT (les deux formes) et ce
// qu'elles ÉCRIVENT (repository, outcome). Le passage par le protocole est dans
// mcp-server.test.ts ; ici on isole la logique de chaque handler.
import { beforeAll, describe, expect, it } from "vitest"

import { makeAck } from "@/mcp/bench/ack"
import type { BenchToolContext } from "@/mcp/bench/context"
import { mutateHandler } from "@/mcp/bench/handlers/mutate"
import { readmeHandler } from "@/mcp/bench/handlers/readme"
import { whoamiHandler } from "@/mcp/bench/handlers/whoami"
import { dispatchToolCall } from "@/mcp/bench/registry"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"
import { loadSnapshot, type BenchSnapshot } from "@/mcp/bench/snapshot"

import { makeScenario, makeTool, makeToolContext } from "../factories/bench.factory"

const SECRET = "test-secret"
const NOW = new Date("2026-01-01T00:00:30Z")

beforeAll(() => {
  process.env.BENCH_ACK_SECRET = SECRET
})

function textOf(result: { content: unknown }): string {
  const [block] = result.content as { type: string; text: string }[]
  return block.text
}

const PROBES = () => [
  makeTool({ name: "bench_whoami", handler: "whoami", sort_order: 10 }),
  makeTool({ name: "bench_echo", sort_order: 20, version: 3 }),
  makeTool({ name: "bench_readme", handler: "readme", sort_order: 40 }),
]

async function setup(scenarioOverrides = {}, tools = PROBES()) {
  const repo = new MemoryBenchRepository(makeScenario(scenarioOverrides), tools)
  const snapshot = await loadSnapshot(repo)
  const ctx = makeToolContext({ repo, now: () => NOW })
  return { repo, snapshot, ctx }
}

/**
 * Serveur réduit à ce que mutate utilise : `server.notification`. Double `as` assumé — le
 * McpServer réel exige un transport, alors que le test ne veut que distinguer « l'écriture
 * dans le flux a réussi » de « elle a échoué ». Le vrai bout-en-bout est dans mcp-server.test.
 */
function serverWith(notification: (...args: unknown[]) => Promise<void>): BenchToolContext["server"] {
  return { server: { notification } } as unknown as BenchToolContext["server"]
}

function outcomeOf(ctx: BenchToolContext) {
  return ctx.outcomes.get(String(ctx.requestId))
}

describe("bench_whoami", () => {
  it("annonce le scénario, la version, les tools servis et les empreintes courtes", async () => {
    const { snapshot, ctx } = await setup({ readme_content: "Read me." })
    const headers = new Headers({
      "user-agent": "claude-code/1.2",
      "mcp-protocol-version": "2025-06-18",
    })

    const result = whoamiHandler({}, { ...ctx, headers, fingerprint: { userAgent: "claude-code/1.2", ip: null } }, snapshot)
    const payload = result.structuredContent as Record<string, unknown>

    expect(payload).toMatchObject({
      scenario: "baseline",
      server_version: "1.0.0",
      lever: "none",
      tools: ["bench_whoami@1", "bench_echo@3", "bench_readme@1"],
      ack_required: false,
      next_actions: [],
      request: {
        user_agent: "claude-code/1.2",
        protocol_version: "2025-06-18",
        session_id: "none",
      },
    })
    expect(payload.instructions_sha256).toMatch(/^[0-9a-f]{12}$/)
    expect(payload.readme_sha256).toMatch(/^[0-9a-f]{12}$/)
    // Le texte est la SEULE voie fiable vers le modèle : il porte le même objet.
    expect(JSON.parse(textOf(result))).toEqual(payload)
  })

  it("renvoie la note du testeur telle quelle, et omet le champ sans note", async () => {
    const { snapshot, ctx } = await setup()

    const tagged = whoamiHandler({ note: "claude-code/opus" }, ctx, snapshot)
    expect(tagged.structuredContent).toMatchObject({ note: "claude-code/opus" })
    expect(textOf(tagged)).toContain('"note": "claude-code/opus"')

    expect(whoamiHandler({}, ctx, snapshot).structuredContent).not.toHaveProperty("note")
  })

  it("borne la note à 200 caractères et ignore une note qui n'est pas une string", async () => {
    const { snapshot, ctx } = await setup()

    const long = whoamiHandler({ note: "x".repeat(500) }, ctx, snapshot)
    expect((long.structuredContent as { note: string }).note).toHaveLength(200)

    expect(whoamiHandler({ note: 42 }, ctx, snapshot).structuredContent).not.toHaveProperty("note")
  })

  it("rend readme_sha256 nul quand le scénario n'a pas de readme", async () => {
    const { snapshot, ctx } = await setup()

    const payload = whoamiHandler({}, ctx, snapshot).structuredContent as Record<string, unknown>

    expect(payload.readme_sha256).toBeNull()
  })

  it("sous le levier ack, annonce ack_required et renvoie vers bench_readme", async () => {
    const { snapshot, ctx } = await setup({ readme_lever: "ack", readme_content: "Read me." })

    const payload = whoamiHandler({}, ctx, snapshot).structuredContent as Record<string, unknown>

    expect(payload).toMatchObject({ lever: "ack", ack_required: true, next_actions: ["bench_readme"] })
  })

  it("sous name_first, annonce le readme sous son nom servi et en tête", async () => {
    const { snapshot, ctx } = await setup({ readme_lever: "name_first", readme_content: "Read me." })

    const payload = whoamiHandler({}, ctx, snapshot).structuredContent as Record<string, unknown>

    expect(payload.tools).toEqual(["bench_00_readme@1", "bench_whoami@1", "bench_echo@3"])
  })
})

describe("bench_readme", () => {
  it("sert le contenu puis la ligne ack, et le même ack dans la même fenêtre", async () => {
    const { snapshot, ctx } = await setup({ readme_content: "Read me. [C:baseline:readme:start:b001]" })

    const result = readmeHandler({}, ctx, snapshot)
    const expected = makeAck({
      secret: SECRET,
      scenarioId: snapshot.scenario?.id ?? "",
      readmeContent: "Read me. [C:baseline:readme:start:b001]",
      ttlSeconds: null,
      now: NOW,
    })

    expect(textOf(result)).toBe(`Read me. [C:baseline:readme:start:b001]\n\nack: ${expected}`)
    expect(result.structuredContent).toEqual({ ack: expected, lever: "none", ttl_seconds: null })
    expect(textOf(readmeHandler({}, ctx, snapshot))).toBe(textOf(result))
  })

  it("le dit quand le scénario n'a pas de readme", async () => {
    const { snapshot, ctx } = await setup()

    expect(textOf(readmeHandler({}, ctx, snapshot))).toContain(
      "No readme configured for this scenario."
    )
  })

  it("rend un ack différent quand le readme change", async () => {
    const first = await setup({ readme_content: "A" })
    const second = await setup({ readme_content: "B" })

    expect(textOf(readmeHandler({}, first.ctx, first.snapshot))).not.toBe(
      textOf(readmeHandler({}, second.ctx, second.snapshot))
    )
  })
})

describe("bench_mutate", () => {
  it("create_tool ajoute une ligne echo activée, en fin de sort_order, et bump la version", async () => {
    const { repo, snapshot, ctx } = await setup()

    const result = await mutateHandler(
      { action: "create_tool", name: "bench_new", description: "New." },
      ctx,
      snapshot
    )

    const created = repo.tools.find((row) => row.name === "bench_new")
    expect(created).toMatchObject({ handler: "echo", enabled: true, sort_order: 50, version: 1 })
    expect(repo.scenario?.server_version).toBe("1.0.1")
    expect(textOf(result)).toContain("Now call bench_whoami and compare with your tool list.")
    expect(result.structuredContent).toMatchObject({
      action: "create_tool",
      server_version: "1.0.1",
      next_actions: ["bench_whoami"],
    })
  })

  it("create_tool refuse un nom déjà pris et ne bump rien", async () => {
    const { repo, snapshot, ctx } = await setup()

    const result = await mutateHandler({ action: "create_tool", name: "bench_echo" }, ctx, snapshot)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("already exists")
    expect(repo.scenario?.server_version).toBe("1.0.0")
  })

  it("update_tool pose les champs fournis et incrémente la version du tool", async () => {
    const { repo, snapshot, ctx } = await setup()

    await mutateHandler(
      { action: "update_tool", name: "bench_echo", description: "Version B." },
      ctx,
      snapshot
    )

    const row = repo.tools.find((tool) => tool.name === "bench_echo")
    expect(row).toMatchObject({ description: "Version B.", version: 4 })
    expect(row?.updated_at).not.toBe(row?.created_at)
  })

  it("update_tool sur un tool absent répond isError", async () => {
    const { snapshot, ctx } = await setup()

    const result = await mutateHandler({ action: "update_tool", name: "ghost" }, ctx, snapshot)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("not found in scenario baseline")
  })

  it("disable_tool puis enable_tool basculent enabled", async () => {
    const { repo, snapshot, ctx } = await setup()

    await mutateHandler({ action: "disable_tool", name: "bench_echo" }, ctx, snapshot)
    expect(repo.tools.find((tool) => tool.name === "bench_echo")?.enabled).toBe(false)

    await mutateHandler({ action: "enable_tool", name: "bench_echo" }, ctx, snapshot)
    expect(repo.tools.find((tool) => tool.name === "bench_echo")?.enabled).toBe(true)
    // La version suivante est calculée depuis celle SERVIE par le snapshot : deux mutations
    // dans la même requête partent de la même base (une requête = un snapshot, jamais relu).
    expect(repo.scenario?.server_version).toBe("1.0.1")
  })

  it("set_instructions remplace les instructions du scénario", async () => {
    const { repo, snapshot, ctx } = await setup()

    await mutateHandler({ action: "set_instructions", instructions: "Nouvelles." }, ctx, snapshot)

    expect(repo.scenario?.instructions).toBe("Nouvelles.")
  })

  it("bump_version n'incrémente que la version serveur", async () => {
    const { repo, snapshot, ctx } = await setup()

    await mutateHandler({ action: "bump_version" }, ctx, snapshot)

    expect(repo.scenario?.server_version).toBe("1.0.1")
    expect(repo.tools.map((tool) => tool.version)).toEqual([1, 3, 1])
  })

  it("refuse un nom hors motif en nommant le champ et la règle", async () => {
    const { snapshot, ctx } = await setup()

    const result = await mutateHandler({ action: "create_tool", name: "bad name!" }, ctx, snapshot)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("name: must match ^[a-zA-Z0-9_.-]{1,255}$")
  })

  it("refuse une action inconnue et une description au-delà du plafond", async () => {
    const { snapshot, ctx } = await setup()

    expect(textOf(await mutateHandler({ action: "drop_table" }, ctx, snapshot))).toContain("action:")
    expect(
      textOf(
        await mutateHandler(
          { action: "update_tool", name: "bench_echo", description: "x".repeat(100 * 1024 + 1) },
          ctx,
          snapshot
        )
      )
    ).toContain("description: must be at most 102400 bytes")
  })

  it("exige name pour les actions de tool et instructions pour set_instructions", async () => {
    const { snapshot, ctx } = await setup()

    expect(textOf(await mutateHandler({ action: "disable_tool" }, ctx, snapshot))).toContain(
      "name: is required for action disable_tool"
    )
    expect(textOf(await mutateHandler({ action: "set_instructions" }, ctx, snapshot))).toContain(
      "instructions: is required for action set_instructions"
    )
  })

  it("renseigne list_changed_sent = false quand aucun flux n'accepte la notification", async () => {
    const { snapshot, ctx } = await setup()
    const refusing = { ...ctx, server: serverWith(() => Promise.reject(new Error("no stream"))) }

    await mutateHandler({ action: "bump_version" }, refusing, snapshot)

    expect(outcomeOf(refusing)).toEqual({ listChangedSent: false })
  })

  it("renseigne list_changed_sent = true quand la notification est écrite dans le flux", async () => {
    const { snapshot, ctx } = await setup()
    const sent: unknown[] = []
    const accepting = {
      ...ctx,
      server: serverWith((...args: unknown[]) => {
        sent.push(args)
        return Promise.resolve()
      }),
    }

    const result = await mutateHandler({ action: "bump_version" }, accepting, snapshot)

    expect(outcomeOf(accepting)).toEqual({ listChangedSent: true })
    expect(result.structuredContent).toMatchObject({ list_changed_sent: true })
    // La notification est ADRESSÉE à l'appel courant : sans ça, rien ne part en stateless.
    expect(sent).toEqual([
      [{ method: "notifications/tools/list_changed" }, { relatedRequestId: ctx.requestId }],
    ])
  })

  it("refuse toute action quand aucun scénario n'est actif", async () => {
    const repo = new MemoryBenchRepository()
    const snapshot = await loadSnapshot(repo)

    const result = await mutateHandler(
      { action: "bump_version" },
      makeToolContext({ repo }),
      snapshot
    )

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe("No active scenario. Activate one in the database first.")
  })
})

describe("levier ack", () => {
  const TTL = 60

  async function ackSetup() {
    const repo = new MemoryBenchRepository(
      makeScenario({ readme_lever: "ack", readme_content: "Read me.", ack_ttl_seconds: TTL }),
      PROBES()
    )
    const snapshot = await loadSnapshot(repo)
    return { snapshot, ctx: makeToolContext({ repo, now: () => NOW }) }
  }

  function ackAt(scenarioId: string, at: Date): string {
    return makeAck({
      secret: SECRET,
      scenarioId,
      readmeContent: "Read me.",
      ttlSeconds: TTL,
      now: at,
    })
  }

  it("accepte l'ack de la fenêtre courante", async () => {
    const { snapshot, ctx } = await ackSetup()
    const ack = ackAt(snapshot.scenario?.id ?? "", NOW)

    const result = await dispatchToolCall(snapshot, "bench_echo", { message: "x", ack }, ctx)

    expect(result.isError).toBeFalsy()
    // L'ack n'est PAS retiré des arguments : ce que le host transmet est une mesure.
    expect(result.structuredContent).toEqual({ args: { message: "x", ack } })
  })

  it("refuse un ack de la fenêtre n-2 en disant qu'il a expiré", async () => {
    const { snapshot, ctx } = await ackSetup()
    const stale = ackAt(snapshot.scenario?.id ?? "", new Date(NOW.getTime() - 2 * TTL * 1000))

    const result = await dispatchToolCall(snapshot, "bench_echo", { ack: stale }, ctx)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      "Call bench_readme first and pass its ack. Your ack has expired."
    )
  })

  it("refuse un ack inventé sans parler d'expiration", async () => {
    const { snapshot, ctx } = await ackSetup()

    const result = await dispatchToolCall(snapshot, "bench_echo", { ack: "AAAAAAAAAAAA" }, ctx)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe("Call bench_readme first and pass its ack.")
  })

  it("laisse toujours passer le tool readme lui-même", async () => {
    const { snapshot, ctx } = await ackSetup()

    expect((await dispatchToolCall(snapshot, "bench_readme", {}, ctx)).isError).toBeFalsy()
  })
})

describe("levier gate", () => {
  const GATE_HEADERS = new Headers({
    "user-agent": "claude-code/1.2",
    "x-forwarded-for": "203.0.113.7",
  })

  async function gateSetup(): Promise<{ repo: MemoryBenchRepository; snapshot: BenchSnapshot; ctx: BenchToolContext }> {
    const repo = new MemoryBenchRepository(
      makeScenario({ readme_lever: "gate", readme_content: "Read me.", ack_ttl_seconds: 60 }),
      PROBES()
    )
    const snapshot = await loadSnapshot(repo)
    const ctx = makeToolContext({
      repo,
      headers: GATE_HEADERS,
      fingerprint: { userAgent: "claude-code/1.2", ip: "203.0.113.7" },
      now: () => NOW,
    })
    return { repo, snapshot, ctx }
  }

  it("refuse un tool non-readme sans appel readme récent de la même empreinte", async () => {
    const { snapshot, ctx } = await gateSetup()

    const result = await dispatchToolCall(snapshot, "bench_echo", { message: "x" }, ctx)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe("Call bench_readme first.")
    expect(outcomeOf(ctx)?.errorText).toBe("Call bench_readme first.")
  })

  it("laisse passer après un appel readme journalisé pour la même empreinte", async () => {
    const { repo, snapshot, ctx } = await gateSetup()
    await repo.insertEvents([
      {
        method: "tools/call",
        tool_name: "bench_readme",
        user_agent: "claude-code/1.2",
        ip: "203.0.113.7",
        ts: new Date(NOW.getTime() - 10_000).toISOString(),
      },
    ])

    const result = await dispatchToolCall(snapshot, "bench_echo", { message: "x" }, ctx)

    expect(result.isError).toBeFalsy()
  })

  it("ignore un appel readme d'une autre empreinte ou hors fenêtre", async () => {
    const { repo, snapshot, ctx } = await gateSetup()
    await repo.insertEvents([
      {
        method: "tools/call",
        tool_name: "bench_readme",
        user_agent: "autre-host/1.0",
        ip: "203.0.113.7",
        ts: NOW.toISOString(),
      },
      {
        method: "tools/call",
        tool_name: "bench_readme",
        user_agent: "claude-code/1.2",
        ip: "203.0.113.7",
        ts: new Date(NOW.getTime() - 120_000).toISOString(),
      },
    ])

    expect((await dispatchToolCall(snapshot, "bench_echo", {}, ctx)).isError).toBe(true)
  })

  it("laisse toujours passer le tool readme lui-même", async () => {
    const { snapshot, ctx } = await gateSetup()

    expect((await dispatchToolCall(snapshot, "bench_readme", {}, ctx)).isError).toBeFalsy()
  })
})
