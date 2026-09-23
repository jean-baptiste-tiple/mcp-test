// Texte d'un appelant avant une colonne Postgres (journal auth-test) : sans NUL ni surrogate isolé, que
// Postgres refuse en faisant tomber tout le lot d'insertion, et tronqué sans couper un code point en deux.
// Sans ces tests, une régression ne se verrait qu'au premier lot de journal perdu en production.
import { describe, expect, it } from "vitest"

import { sanitizeText } from "@/lib/utils/sanitize-text"

const LONE_SURROGATE = /\p{Cs}/u

describe("sanitizeText", () => {
  it("laisse intact un texte propre sous le plafond, accents et emojis compris", () => {
    expect(sanitizeText("initialize", 100)).toBe("initialize")
    expect(sanitizeText("claude-ai@0.1.0 é🙂", 100)).toBe("claude-ai@0.1.0 é🙂")
  })

  it("retire les NUL", () => {
    expect(sanitizeText("tools/\u0000list\u0000", 100)).toBe("tools/list")
  })

  it("retire les surrogates isolés, y compris ceux qu'un JSON échappé fait naître", () => {
    const fromJson: string = JSON.parse('"a\\ud800b\\udc00c\\ud83d"')

    expect(sanitizeText(fromJson, 100)).toBe("abc")
    expect(sanitizeText("\udc00🙂\ud800", 100)).toBe("🙂")
  })

  it("coupe à une frontière de code point : un emoji reste entier, jamais un surrogate isolé", () => {
    expect("x🙂".slice(0, 2)).toMatch(LONE_SURROGATE) // ce que faisait .slice()
    expect(sanitizeText("x🙂y", 2)).toBe("x🙂")
    expect(sanitizeText("🙂🙂🙂", 1)).toBe("🙂")
    expect(sanitizeText("🙂".repeat(300), 200)).not.toMatch(LONE_SURROGATE)
  })

  it("plafond en caractères, compté après retrait", () => {
    expect(sanitizeText("x".repeat(500), 100)).toHaveLength(100)
    expect(sanitizeText("\u0000".repeat(5) + "abc", 2)).toBe("ab")
    expect(sanitizeText("abc", 0)).toBe("")
  })
})
