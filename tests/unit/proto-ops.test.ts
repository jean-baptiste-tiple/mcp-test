// Opérations d'écriture sans base (E04-S03, E04-S04) : sections d'une page, lignes d'un tableau.
import { describe, expect, it } from "vitest"

import { applyRowWrite, NULL_REFUSED } from "@/proto/functions/table"
import { ProtoError } from "@/proto/result"
import { applyOps, type Section } from "@/proto/services/sections"

const PAGE: Section[] = [
  { title: "Contexte", body: "Un client." },
  { title: "Étapes", body: "1. Lire.\n2. Écrire." },
]

describe("applyOps", () => {
  it("chaque opération, titres sans casse ni accents", () => {
    const { sections, touched } = applyOps(PAGE, [
      { op: "append", section: "etapes", text: "3. Publier." },
      { op: "replace_section", section: "contexte", text: "Deux clients." },
      { op: "add_section", section: "Risques", text: "Aucun.", after: "Contexte" },
      { op: "replace_text", section: "Étapes", find: "2. Écrire.", text: "2. Rédiger." },
    ])
    expect(sections.map((s) => s.title)).toEqual(["Contexte", "Risques", "Étapes"])
    expect(sections[2].body).toBe("1. Lire.\n2. Rédiger.\n\n3. Publier.")
    expect(touched).toHaveLength(4)
    expect(PAGE[0].body).toBe("Un client.") // l'entrée n'est pas modifiée
    expect(applyOps(PAGE, [{ op: "delete_section", section: "Contexte" }]).sections.map((s) => s.title)).toEqual(["Étapes"])
  })

  it("refus : section inconnue (liste des titres), doublon, find absent ou répété, texte manquant", () => {
    expect(() => applyOps(PAGE, [{ op: "append", section: "Budget", text: "x" }])).toThrow(/Unknown section « Budget »\. Sections: « Contexte », « Étapes »/)
    expect(() => applyOps(PAGE, [{ op: "add_section", section: "contexte", text: "x" }])).toThrow(/already exists/)
    expect(() => applyOps(PAGE, [{ op: "replace_text", section: "Étapes", find: ".", text: "x" }])).toThrow(/appears 4 times/)
    expect(() => applyOps(PAGE, [{ op: "replace_text", section: "Étapes", text: "x" }])).toThrow(ProtoError)
    expect(() => applyOps(PAGE, [{ op: "replace_section", section: "Étapes" }])).toThrow(/needs text/)
  })
})

describe("applyRowWrite (table.write)", () => {
  const meta = {
    key: "id",
    state_column: "statut",
    states: ["à traiter", "en cours"],
    columns: [
      { name: "notes", type: "text" as const },
      { name: "montant", type: "number" as const },
      { name: "date", type: "date" as const },
      { name: "statut", type: "enum" as const, values: ["à traiter", "en cours"] },
    ],
  }
  const current = { values: { notes: "a", montant: 1, statut: "à traiter" }, provenance: {} }

  it("set, clear, verified_empty ; champ non nommé intact ; provenance", () => {
    const res = applyRowWrite(meta, current, { key: "P-1", set: { notes: "b" }, clear: ["montant"], verified_empty: [{ column: "date", reason: "introuvable" }] }, "jb", "t")
    expect(res.values).toEqual({ notes: "b", statut: "à traiter" })
    expect(res.provenance).toMatchObject({ notes: { origin: "agent", by: "jb" }, date: { origin: "verified_empty", reason: "introuvable" } })
    expect(res.refused).toEqual([])
  })

  it("null refusé avec la raison ; type, état, colonne inconnue, clé, colonne d'état vidée", () => {
    const res = applyRowWrite(
      meta,
      current,
      { key: "P-1", set: { notes: null, montant: "3", statut: "fini", date: "23/09", couleur: "x", id: "P-2" }, clear: ["statut"] },
      "jb",
      "t"
    )
    expect(res.changed).toEqual([])
    expect(res.refused).toEqual([
      `notes: ${NULL_REFUSED}`,
      "montant: expected a number (not a string)",
      "statut: expected one of: à traiter, en cours",
      "date: expected a date YYYY-MM-DD",
      "couleur: unknown column",
      "id: unknown column",
      "statut: the state column cannot be cleared",
    ])
  })
})
