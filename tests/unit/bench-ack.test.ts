// Ack du levier readme : un HMAC fenêtré doit être RECALCULABLE à l'identique dans la
// fenêtre (le serveur ne mémorise rien, ADR-001) et changer avec ce qu'il atteste.
import { afterEach, describe, expect, it, vi } from "vitest"

import { getAckSecret, makeAck, verifyAck } from "@/mcp/bench/ack"

const BASE = {
  secret: "test-secret",
  scenarioId: "11111111-1111-1111-1111-111111111111",
  readmeContent: "Read me first.",
  ttlSeconds: 60,
}

/** Instant au milieu d'une fenêtre de 60 s, pour éviter les bascules de bord. */
const T0 = new Date("2026-01-01T00:00:30Z")

function at(offsetSeconds: number): Date {
  return new Date(T0.getTime() + offsetSeconds * 1000)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("makeAck", () => {
  it("rend le même code deux fois dans la même fenêtre", () => {
    expect(makeAck({ ...BASE, now: at(0) })).toBe(makeAck({ ...BASE, now: at(20) }))
  })

  it("rend 12 caractères de l'alphabet base32 RFC 4648, sans padding", () => {
    const ack = makeAck({ ...BASE, now: at(0) })

    expect(ack).toHaveLength(12)
    expect(ack).toMatch(/^[A-Z2-7]{12}$/)
  })

  it("change quand le readme change", () => {
    expect(makeAck({ ...BASE, now: at(0) })).not.toBe(
      makeAck({ ...BASE, readmeContent: "Another readme.", now: at(0) })
    )
  })

  it("change quand le scénario change", () => {
    expect(makeAck({ ...BASE, now: at(0) })).not.toBe(
      makeAck({ ...BASE, scenarioId: "22222222-2222-2222-2222-222222222222", now: at(0) })
    )
  })

  it("avec un TTL nul, reste identique à des jours d'intervalle (fenêtre 0)", () => {
    const stable = { ...BASE, ttlSeconds: null }

    expect(makeAck({ ...stable, now: at(0) })).toBe(makeAck({ ...stable, now: at(86_400 * 3) }))
  })
})

describe("verifyAck", () => {
  it("accepte l'ack de la fenêtre courante", () => {
    const candidate = makeAck({ ...BASE, now: at(0) })

    expect(verifyAck({ ...BASE, now: at(20), candidate })).toEqual({ valid: true, expired: false })
  })

  it("accepte encore l'ack de la fenêtre précédente", () => {
    const candidate = makeAck({ ...BASE, now: at(0) })

    expect(verifyAck({ ...BASE, now: at(60), candidate })).toEqual({ valid: true, expired: false })
  })

  it("refuse l'ack de la fenêtre n-2 en signalant l'expiration", () => {
    const candidate = makeAck({ ...BASE, now: at(0) })

    expect(verifyAck({ ...BASE, now: at(120), candidate })).toEqual({ valid: false, expired: true })
  })

  it("refuse un ack inventé sans le dire expiré", () => {
    expect(verifyAck({ ...BASE, now: at(0), candidate: "AAAAAAAAAAAA" })).toEqual({
      valid: false,
      expired: false,
    })
  })

  it("refuse un ack absent", () => {
    expect(verifyAck({ ...BASE, now: at(0), candidate: "" })).toEqual({
      valid: false,
      expired: false,
    })
  })

  it("refuse un ack calculé avec un autre readme", () => {
    const candidate = makeAck({ ...BASE, readmeContent: "Another readme.", now: at(0) })

    expect(verifyAck({ ...BASE, now: at(0), candidate })).toEqual({ valid: false, expired: false })
  })
})

describe("getAckSecret", () => {
  it("rend la variable d'environnement quand elle est posée", () => {
    vi.stubEnv("BENCH_ACK_SECRET", "from-env")

    expect(getAckSecret()).toBe("from-env")
  })

  it("jette en production quand le secret manque", async () => {
    vi.stubEnv("BENCH_ACK_SECRET", "")
    vi.stubEnv("NODE_ENV", "production")
    // Module neuf : l'avertissement de repli est mémorisé au niveau du module.
    vi.resetModules()
    const { getAckSecret: fresh } = await import("@/mcp/bench/ack")

    expect(() => fresh()).toThrow("BENCH_ACK_SECRET missing")
  })

  it("hors production, retombe sur dev-secret en n'avertissant qu'une fois", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("BENCH_ACK_SECRET", "")
    vi.stubEnv("NODE_ENV", "development")
    vi.resetModules()
    const { getAckSecret: fresh } = await import("@/mcp/bench/ack")

    expect(fresh()).toBe("dev-secret")
    expect(fresh()).toBe("dev-secret")
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
