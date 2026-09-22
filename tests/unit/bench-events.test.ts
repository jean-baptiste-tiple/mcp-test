// Journal : body JSON-RPC + en-têtes → lignes bench_events, et robustesse de l'écriture.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ToolOutcome } from "@/mcp/bench/context"
import { applyOutcomes, httpEvent, logEvents, parseRpcBody } from "@/mcp/bench/events"
import { MemoryBenchRepository } from "@/mcp/bench/repository.memory"
import { loadSnapshot } from "@/mcp/bench/snapshot"
import { MAX_EVENTS_PER_REQUEST, MAX_LOGGED_ARGS_BYTES } from "@/mcp/config"

import { makeScenario, makeTool } from "../factories/bench.factory"

async function snapshotWith(tools = [makeTool({ name: "bench_echo" })]) {
  return loadSnapshot(new MemoryBenchRepository(makeScenario(), tools))
}

const HEADERS = new Headers({
  "user-agent": "claude-code/1.2",
  "x-forwarded-for": "203.0.113.7, 70.41.3.18",
  "mcp-protocol-version": "2025-06-18",
  "mcp-session-id": "sess-42",
})

function rpc(method: string, params: unknown, id: number | string | null = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("parseRpcBody", () => {
  it("extrait clientInfo, en-têtes et scénario d'un initialize", async () => {
    const snapshot = await snapshotWith()

    const [event] = parseRpcBody(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "x", version: "1" },
      }),
      HEADERS,
      snapshot
    )

    expect(event).toMatchObject({
      method: "initialize",
      rpc_id: "1",
      client_name: "x",
      client_version: "1",
      protocol_version: "2025-06-18",
      user_agent: "claude-code/1.2",
      ip: "203.0.113.7", // premier élément de x-forwarded-for uniquement
      session_id: "sess-42",
      scenario_slug: "baseline",
      server_version: "1.0.0",
    })
  })

  it("retombe sur l'en-tête mcp-protocol-version quand params ne la porte pas", async () => {
    const [event] = parseRpcBody(rpc("ping", {}), HEADERS, await snapshotWith())

    expect(event.protocol_version).toBe("2025-06-18")
    expect(event.client_name).toBeNull()
  })

  it("laisse les champs d'en-tête nuls quand ils sont absents", async () => {
    const [event] = parseRpcBody(rpc("ping", {}), new Headers(), await snapshotWith())

    expect(event).toMatchObject({
      user_agent: null,
      ip: null,
      session_id: null,
      protocol_version: null,
    })
  })

  it("porte tool_name et args sur un tools/call", async () => {
    const [event] = parseRpcBody(
      rpc("tools/call", { name: "bench_echo", arguments: { message: "hello" } }, "abc"),
      HEADERS,
      await snapshotWith()
    )

    expect(event).toMatchObject({
      method: "tools/call",
      rpc_id: "abc",
      tool_name: "bench_echo",
      args: { message: "hello" },
    })
  })

  it("tronque les args au-delà du plafond de journalisation", async () => {
    const message = "x".repeat(MAX_LOGGED_ARGS_BYTES + 100)

    const [event] = parseRpcBody(
      rpc("tools/call", { name: "bench_echo", arguments: { message } }),
      HEADERS,
      await snapshotWith()
    )

    const args = event.args as { truncated: boolean; bytes: number; preview: string }
    expect(args.truncated).toBe(true)
    expect(args.bytes).toBeGreaterThan(MAX_LOGGED_ARGS_BYTES)
    expect(args.preview.length).toBeLessThanOrEqual(MAX_LOGGED_ARGS_BYTES)
  })

  it("compte les tools servis et la taille de la réponse sur un tools/list", async () => {
    const snapshot = await snapshotWith([
      makeTool({ name: "bench_a", sort_order: 0 }),
      makeTool({ name: "bench_b", sort_order: 1 }),
    ])

    const [event] = parseRpcBody(rpc("tools/list", {}, 2), HEADERS, snapshot)

    expect(event.tools_served).toBe(2)
    expect(event.response_chars).toBeGreaterThan(0)
  })

  it("journalise une ligne par message d'un batch", async () => {
    const body = `[${rpc("initialize", { clientInfo: { name: "x", version: "1" } }, 1)},${rpc(
      "tools/list",
      {},
      2
    )}]`

    const events = parseRpcBody(body, HEADERS, await snapshotWith())

    expect(events).toHaveLength(2)
    expect(events.map((e) => e.method)).toEqual(["initialize", "tools/list"])
    expect(events[1].tools_served).toBe(1)
  })

  it("neutralise les caractères NUL des args, que jsonb refuse", async () => {
    const [event] = parseRpcBody(
      rpc("tools/call", { name: "bench_echo", arguments: { message: "a\u0000b" } }),
      HEADERS,
      await snapshotWith()
    )

    expect(event.args).toEqual({ message: "a�b" })
  })

  it("neutralise les surrogates isolés des args, sans toucher aux emojis", async () => {
    const [event] = parseRpcBody(
      rpc("tools/call", { name: "bench_echo", arguments: { bad: "\ud800", ok: "🙂" } }),
      HEADERS,
      await snapshotWith()
    )

    expect(event.args).toEqual({ bad: "�", ok: "🙂" })
  })

  it("neutralise aussi les colonnes texte issues du body", async () => {
    const [event] = parseRpcBody(
      rpc("initialize", { clientInfo: { name: "x\u0000y", version: "1\ud800" } }, "id\u0000"),
      HEADERS,
      await snapshotWith()
    )

    expect(event.client_name).toBe("x�y")
    expect(event.client_version).toBe("1�")
    expect(event.rpc_id).toBe("id�")
  })

  it("plafonne le nombre d'événements d'un batch et le signale", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const received = MAX_EVENTS_PER_REQUEST + 1
    const body = `[${Array.from({ length: received }, (_, i) => rpc("ping", {}, i)).join(",")}]`

    expect(parseRpcBody(body, HEADERS, await snapshotWith())).toHaveLength(MAX_EVENTS_PER_REQUEST)
    expect(consoleWarn).toHaveBeenCalledWith("[bench] batch tronqué", {
      received,
      kept: MAX_EVENTS_PER_REQUEST,
    })
  })

  it("ignore un body illisible ou sans méthode", async () => {
    const snapshot = await snapshotWith()

    expect(parseRpcBody("pas du json", HEADERS, snapshot)).toEqual([])
    expect(parseRpcBody(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), HEADERS, snapshot)).toEqual([])
  })
})

describe("httpEvent", () => {
  it("journalise un GET avec l'empreinte et les en-têtes, sans scénario servi", () => {
    expect(httpEvent("GET", HEADERS)).toEqual({
      method: "http:GET",
      scenario_slug: null,
      server_version: null,
      user_agent: "claude-code/1.2",
      ip: "203.0.113.7",
      session_id: "sess-42",
      protocol_version: "2025-06-18",
    })
  })

  it("journalise un DELETE de la même façon", () => {
    expect(httpEvent("DELETE", new Headers()).method).toBe("http:DELETE")
  })
})

describe("applyOutcomes", () => {
  async function callEvents() {
    return parseRpcBody(
      `[${rpc("tools/call", { name: "bench_mutate", arguments: {} }, 7)},${rpc(
        "tools/call",
        { name: "bench_echo", arguments: {} },
        8
      )}]`,
      HEADERS,
      await snapshotWith()
    )
  }

  it("recolle list_changed_sent, is_error et error_text par rpc_id", async () => {
    const events = await callEvents()
    const outcomes = new Map<string, ToolOutcome>([
      ["7", { listChangedSent: false }],
      ["8", { isError: true, errorText: "Call bench_readme first." }],
    ])

    applyOutcomes(events, outcomes)

    expect(events[0]).toMatchObject({ rpc_id: "7", list_changed_sent: false })
    expect(events[1]).toMatchObject({
      rpc_id: "8",
      is_error: true,
      error_text: "Call bench_readme first.",
    })
  })

  it("laisse intacts les événements sans outcome", async () => {
    const events = await callEvents()

    applyOutcomes(events, new Map())

    expect(events[0].list_changed_sent).toBeUndefined()
    expect(events[0].is_error).toBeUndefined()
  })

  it("neutralise les caractères que jsonb refuse dans error_text", async () => {
    const events = await callEvents()

    applyOutcomes(events, new Map([["7", { isError: true, errorText: "bad\u0000text" }]]))

    expect(events[0].error_text).toBe("bad�text")
  })
})

describe("logEvents", () => {
  it("écrit les événements dans le repository", async () => {
    const repo = new MemoryBenchRepository()

    await logEvents(repo, parseRpcBody(rpc("ping", {}), HEADERS, await snapshotWith()))

    expect(repo.inserted).toHaveLength(1)
  })

  it("avale l'erreur d'insertion et la signale une seule fois", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = new MemoryBenchRepository()
    repo.insertError = new Error("bench_events: connexion perdue")

    await expect(
      logEvents(repo, parseRpcBody(rpc("ping", {}), HEADERS, await snapshotWith()))
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it("n'appelle pas le repository quand il n'y a rien à écrire", async () => {
    const repo = new MemoryBenchRepository()
    repo.insertError = new Error("ne doit pas être atteint")

    await expect(logEvents(repo, [])).resolves.toBeUndefined()
  })
})
