// Opérations d'écriture par section adressée par son titre (E04-S03 ; doc fonctionnel, « Lire et
// écrire à moindre coût »). Fonctions pures, testées sans base : write.ts les applique, read.ts y
// cherche une section. Sans elles, le modèle devrait relire et renvoyer la page entière.
import { ProtoError } from "../result"

export type Section = { title: string; body: string }

export type WriteOp = {
  op: "replace_section" | "append" | "add_section" | "delete_section" | "replace_text"
  section: string
  text?: string
  find?: string
  after?: string
}

/** Titre comparé sans casse ni accents ni espaces de bord : « Étapes » = « etapes ». */
export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
  return norm(a) === norm(b)
}

export function findSection(sections: Section[], title: string): number {
  return sections.findIndex((s) => sameTitle(s.title, title))
}

function titles(sections: Section[]): string {
  return sections.map((s) => `« ${s.title} »`).join(", ") || "none"
}

function requireText(op: WriteOp): string {
  if (op.text === undefined) throw new ProtoError(`${op.op} on « ${op.section} » needs text.`)
  return op.text
}

/** Applique les opérations dans l'ordre ; la première qui échoue refuse tout (rien n'est écrit). */
export function applyOps(start: Section[], ops: WriteOp[]): { sections: Section[]; touched: string[] } {
  const sections = start.map((s) => ({ ...s }))
  const touched: string[] = []

  for (const op of ops) {
    const index = findSection(sections, op.section)
    if (op.op === "add_section") {
      if (index !== -1) throw new ProtoError(`Section « ${op.section} » already exists; use replace_section or append.`)
      let at = sections.length
      if (op.after !== undefined) {
        const after = findSection(sections, op.after)
        if (after === -1) throw new ProtoError(`Unknown section « ${op.after} » for after. Sections: ${titles(sections)}.`)
        at = after + 1
      }
      sections.splice(at, 0, { title: op.section.trim(), body: requireText(op) })
      touched.push(`added « ${op.section.trim()} »`)
      continue
    }

    if (index === -1) throw new ProtoError(`Unknown section « ${op.section} ». Sections: ${titles(sections)}.`)
    const section = sections[index]
    switch (op.op) {
      case "replace_section":
        section.body = requireText(op)
        touched.push(`replaced « ${section.title} »`)
        break
      case "append":
        section.body = section.body ? `${section.body}\n\n${requireText(op)}` : requireText(op)
        touched.push(`appended to « ${section.title} »`)
        break
      case "delete_section":
        sections.splice(index, 1)
        touched.push(`deleted « ${section.title} »`)
        break
      case "replace_text": {
        if (!op.find) throw new ProtoError(`replace_text on « ${section.title} » needs find (the exact words to replace).`)
        const count = section.body.split(op.find).length - 1
        if (count !== 1) {
          throw new ProtoError(`replace_text: « ${op.find} » appears ${count} times in « ${section.title} »; quote words that appear exactly once.`)
        }
        const text = requireText(op)
        section.body = section.body.replace(op.find, () => text) // sans motifs $& ni $1
        touched.push(`edited « ${section.title} »`)
        break
      }
    }
  }
  return { sections, touched }
}
