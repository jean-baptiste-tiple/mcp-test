// Décision du routage (E04-S02) : mélange des composantes et règle seuil + écart, sans base.
import { describe, expect, it } from "vitest"

import { blendScore, type Candidate, decide, SERVE_GAP, SERVE_THRESHOLD } from "@/proto/services/routing"

const candidate = (path: string, score: number): Candidate => ({ nodeId: path, path, title: path, summary: "", kind: "procedure", score })

describe("blendScore", () => {
  it("phrase déclencheuse exacte et tous les lexèmes : 1", () => {
    expect(blendScore({ s_trigger: 1, s_neighbor: 0.3, s_title: 0.5, lexical: 1, query_lexemes: 4 })).toBe(1)
  })

  it("le titre porte seul un nœud sans phrases (page, tableau)", () => {
    expect(blendScore({ s_trigger: 0, s_neighbor: 0, s_title: 0.8, lexical: 0.5, query_lexemes: 3 })).toBeCloseTo(0.55 * 0.8 + 0.45 * 0.5)
  })

  it("une voisine plus proche qu'une déclencheuse fait baisser le score", () => {
    const plain = blendScore({ s_trigger: 0.5, s_neighbor: 0, s_title: 0, lexical: 0.6, query_lexemes: 3 })
    const neighbored = blendScore({ s_trigger: 0.5, s_neighbor: 1, s_title: 0, lexical: 0.6, query_lexemes: 3 })
    expect(neighbored).toBeLessThan(plain - 0.4)
  })

  it("reste dans [0, 1]", () => {
    expect(blendScore({ s_trigger: 0, s_neighbor: 1, s_title: 0, lexical: 0, query_lexemes: 2 })).toBe(0)
  })

  it("une requête d'un seul lexème ne gagne que la moitié de sa part lexicale", () => {
    const one = blendScore({ s_trigger: 0.4, s_neighbor: 0, s_title: 0, lexical: 1, query_lexemes: 1 })
    const two = blendScore({ s_trigger: 0.4, s_neighbor: 0, s_title: 0, lexical: 1, query_lexemes: 2 })
    expect(two - one).toBeCloseTo(0.45 / 2)
  })
})

describe("decide : étapes servies seulement si le premier est net", () => {
  it("au-dessus du seuil avec l'écart : servi", () => {
    expect(decide([candidate("a", SERVE_THRESHOLD + 0.2), candidate("b", SERVE_THRESHOLD + 0.2 - SERVE_GAP - 0.01)])?.path).toBe("a")
  })

  it("écart insuffisant : rien", () => {
    expect(decide([candidate("a", 0.95), candidate("b", 0.95 - SERVE_GAP + 0.01)])).toBeNull()
  })

  it("sous le seuil : rien, même seul", () => {
    expect(decide([candidate("a", SERVE_THRESHOLD - 0.01)])).toBeNull()
  })

  it("aucun candidat : rien", () => {
    expect(decide([])).toBeNull()
  })
})
