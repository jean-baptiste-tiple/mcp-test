// Ack du levier readme : preuve SANS ÉTAT que `bench_readme` a été lu (architecture §6).
// Le transport est stateless (ADR-001) : le serveur ne peut rien mémoriser entre deux
// requêtes, donc l'ack est un HMAC fenêtré recalculable à l'identique à chaque appel.
// `ack = base32(HMAC_SHA256(secret, scenario_id:sha256(readme):window))[0..12]`.
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/** Longueur servie à l'agent : assez court pour être recopié dans le chat, assez long pour
 * qu'il ne se devine pas (12 caractères base32 = 60 bits). */
const ACK_LENGTH = 12

/** Alphabet RFC 4648 (base32), sans padding : pas de `=` à recopier dans une conversation. */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

/**
 * Fenêtre par défaut de l'ack et du gate quand le scénario ne fixe pas `ack_ttl_seconds`
 * (architecture §6 : 1800 s). Sans elle, `gate` interrogerait le journal depuis l'origine
 * des temps et n'expirerait jamais.
 */
export const DEFAULT_ACK_WINDOW_SECONDS = 1800

/**
 * Nombre de fenêtres passées reconnues comme « périmées ». Sans cette reconnaissance, un ack
 * expiré est indistinguable d'un ack faux et le message d'erreur ne peut pas dire à l'agent
 * que son ack a vieilli — or c'est précisément ce que le levier mesure.
 */
const EXPIRED_LOOKBACK_WINDOWS = 10

export type AckInput = {
  secret: string
  scenarioId: string
  readmeContent: string | null
  /** Nul = fenêtre unique (`0`) : l'ack ne périme jamais. */
  ttlSeconds: number | null
  now: Date
}

export type AckVerdict = {
  valid: boolean
  /** Vrai seulement si le candidat correspond à une fenêtre passée reconnaissable. */
  expired: boolean
}

/** sha256 hexadécimal — utilisé par l'ack et par les empreintes courtes de `bench_whoami`. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

function base32(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]

  return out
}

function windowIndex(now: Date, ttlSeconds: number | null): number {
  if (!ttlSeconds) return 0
  return Math.floor(now.getTime() / 1000 / ttlSeconds)
}

function ackForWindow(input: AckInput, window: number): string {
  const message = `${input.scenarioId}:${sha256Hex(input.readmeContent ?? "")}:${window}`
  return base32(createHmac("sha256", input.secret).update(message).digest()).slice(0, ACK_LENGTH)
}

function equals(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate, "utf8")
  const right = Buffer.from(expected, "utf8")
  // Longueurs différentes : timingSafeEqual jette. La comparaison reste à temps constant
  // pour les candidats de bonne longueur, seul cas où le secret pourrait fuir.
  return left.length === right.length && timingSafeEqual(left, right)
}

export function makeAck(input: AckInput): string {
  return ackForWindow(input, windowIndex(input.now, input.ttlSeconds))
}

/** Fenêtre courante OU précédente acceptée : un ack pris juste avant une bascule reste bon. */
export function verifyAck(input: AckInput & { candidate: string }): AckVerdict {
  if (input.candidate === "") return { valid: false, expired: false }

  const current = windowIndex(input.now, input.ttlSeconds)

  for (const window of [current, current - 1]) {
    if (equals(input.candidate, ackForWindow(input, window))) return { valid: true, expired: false }
  }

  for (let back = 2; back <= 1 + EXPIRED_LOOKBACK_WINDOWS; back++) {
    if (equals(input.candidate, ackForWindow(input, current - back))) {
      return { valid: false, expired: true }
    }
  }

  return { valid: false, expired: false }
}

// Un seul avertissement par process : le repli de développement doit se voir une fois, pas
// à chaque requête (le banc en encaisse des milliers).
let warnedAboutFallback = false

/**
 * Secret HMAC des ack. Absent en production = échec bruyant (mcp-patterns §6 bis : jamais de
 * repli silencieux sur un secret) ; en développement, un repli fixe avec avertissement.
 */
export function getAckSecret(): string {
  const secret = process.env.BENCH_ACK_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV === "production") throw new Error("BENCH_ACK_SECRET missing")

  if (!warnedAboutFallback) {
    warnedAboutFallback = true
    console.warn('[bench] BENCH_ACK_SECRET absente : repli "dev-secret" (développement only)')
  }
  return "dev-secret"
}
