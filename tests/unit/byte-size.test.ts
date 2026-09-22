// Les plafonds du banc sont en octets : ces deux fonctions décident ce qui passe (64 ko
// d'arguments) et ce qui est stocké (8 ko de journal).
import { describe, expect, it } from "vitest"

import { byteLength, truncateToBytes } from "@/lib/utils/byte-size"

describe("byteLength", () => {
  it("compte les octets UTF-8, pas les unités de code", () => {
    expect(byteLength("é")).toBe(2)
    expect(byteLength("🙂")).toBe(4) // .length vaut 2 : un contrôle par .length sous-compte
    expect(byteLength("abc")).toBe(3)
  })
})

describe("truncateToBytes", () => {
  it("laisse intact ce qui tient dans le plafond", () => {
    expect(truncateToBytes("é🙂", 6)).toBe("é🙂")
  })

  it("coupe sur la frontière d'octets et marque le caractère tronqué", () => {
    // "é🙂" = C3 A9 | F0 9F 99 82 → couper à 3 octets laisse un emoji entamé.
    const cut = truncateToBytes("é🙂", 3)

    expect(cut).toBe("é�")
    expect(cut.endsWith("�")).toBe(true)
    // U+FFFD pèse 3 octets là où la coupe en laissait 1 : la sortie peut dépasser le
    // plafond de 2 octets au plus. Borné et négligeable devant les 8 ko du journal.
    expect(byteLength(cut)).toBeLessThanOrEqual(3 + 2)
  })
})
