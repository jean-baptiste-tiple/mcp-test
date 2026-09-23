// Connecteurs simulés (E04-S04) : sellsy, mail, slack, et les sondes de mesure probe. Déterministes,
// sans réseau (NFR-PROTO-01) : rien ne sort du serveur. Sans eux, les procédures n'ont aucune
// fonction à appeler et les mesures 3 et 4 (tailles de résultat et d'arguments) aucune sonde.
import { randomBytes } from "node:crypto"

import * as z from "zod/v4"

import { one, must } from "../db"
import { ProtoError } from "../result"
import { defineFunction } from "./define"

const SIMULATED = "simulated connector: nothing left the server"

// --- Sellsy ----------------------------------------------------------------------------------------

type Estimate = {
  id: string
  client: string
  contact: string
  email: string
  status: "draft" | "sent" | "accepted" | "refused"
  /** Jours écoulés depuis l'envoi, relatifs au jour de l'appel : la liste « en attente » reste stable. */
  sentDaysAgo: number | null
  lines: { label: string; qty: number; unitHt: number }[]
}

const ESTIMATES: Estimate[] = [
  { id: "DEV-2026-041", client: "Mairie de Valbrune", contact: "Sophie Lacaze", email: "sophie@valbrune.test", status: "sent", sentDaysAgo: 12, lines: [{ label: "Étude complète d'autoconsommation collective (10 participants)", qty: 1, unitHt: 6500 }] },
  { id: "DEV-2026-042", client: "Camping Les Pins Bleus", contact: "Hugo Ferrand", email: "hugo@saintarlan.test", status: "sent", sentDaysAgo: 9, lines: [{ label: "Pré-étude", qty: 1, unitHt: 1500 }] },
  { id: "DEV-2026-043", client: "Maison de santé du Plateau", contact: "Inès Barral", email: "ines@valbrune.test", status: "sent", sentDaysAgo: 3, lines: [{ label: "Pré-étude", qty: 1, unitHt: 1500 }] },
  { id: "DEV-2026-044", client: "Clinique vétérinaire des Saules", contact: "Paul-Henri Rives", email: "paul-henri@saintarlan.test", status: "accepted", sentDaysAgo: 30, lines: [{ label: "Montage de la PMO", qty: 1, unitHt: 3000 }] },
  { id: "DEV-2026-045", client: "Scierie Vallet", contact: "Denis Vallet", email: "denis@hautelise.test", status: "refused", sentDaysAgo: 40, lines: [{ label: "Étude complète", qty: 1, unitHt: 6500 }] },
  { id: "DEV-2026-046", client: "Salle des sports de Haute-Lise", contact: "Julie Marchal", email: "julie@hautelise.test", status: "sent", sentDaysAgo: 21, lines: [{ label: "Étude complète", qty: 1, unitHt: 6500 }, { label: "Participant supplémentaire", qty: 4, unitHt: 250 }] },
  { id: "DEV-2026-047", client: "Brasserie de la Lise", contact: "Tom Garnier", email: "tom@coudraysurlise.test", status: "draft", sentDaysAgo: null, lines: [{ label: "Pré-étude", qty: 1, unitHt: 1500 }] },
  { id: "DEV-2026-048", client: "Collège Jean-Rostand de Brémontier", contact: "Claire Benoît", email: "claire@bremontier.test", status: "sent", sentDaysAgo: 8, lines: [{ label: "Pré-étude", qty: 1, unitHt: 1500 }] },
]

const euros = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} € HT`
const total = (e: Estimate) => e.lines.reduce((sum, l) => sum + l.qty * l.unitHt, 0)

function sentOn(e: Estimate): string {
  if (e.sentDaysAgo === null) return "not sent"
  const day = new Date(Date.now() - e.sentDaysAgo * 86_400_000).toISOString().slice(0, 10)
  return `sent ${day} (${e.sentDaysAgo} days ago)`
}

function estimateLine(e: Estimate): string {
  return `- ${e.id} · ${e.client} · ${euros(total(e))} · ${e.status} · ${sentOn(e)} · contact ${e.contact} <${e.email}>`
}

const listEstimates = defineFunction({
  name: "sellsy.list_estimates",
  connector: "sellsy",
  class: "read",
  description:
    "Lists the organisation's estimates (devis) in Sellsy, optionally by status and minimum age since sending. Use it to find estimates to follow up; amounts are excl. VAT.",
  schema: z.strictObject({
    status: z.enum(["draft", "sent", "accepted", "refused"]).optional().describe("Only this status (default: all)"),
    older_than_days: z.number().int().min(0).max(365).optional().describe("Only estimates sent at least this many days ago"),
  }),
  examples: [{ status: "sent", older_than_days: 7 }, {}],
  refusals: ["sellsy not open to your team: the refusal names the team that has it and its lead"],
  run: async (_ctx, args) => {
    const found = ESTIMATES.filter(
      (e) =>
        (!args.status || e.status === args.status) &&
        (args.older_than_days === undefined || (e.sentDaysAgo !== null && e.sentDaysAgo >= args.older_than_days))
    )
    if (found.length === 0) return { text: "No estimate matches." }
    return { text: [`${found.length} estimate(s):`, ...found.map(estimateLine)].join("\n") }
  },
})

const getEstimate = defineFunction({
  name: "sellsy.get_estimate",
  connector: "sellsy",
  class: "read",
  description: "Returns one Sellsy estimate (devis) with its lines, total excl. VAT, status and contact. Use it after sellsy.list_estimates.",
  schema: z.strictObject({ id: z.string().min(1).describe("Estimate number, e.g. DEV-2026-041") }),
  examples: [{ id: "DEV-2026-041" }],
  refusals: ["unknown estimate number: the refusal lists the existing ones"],
  run: async (_ctx, args) => {
    const estimate = ESTIMATES.find((e) => e.id === args.id.trim().toUpperCase())
    if (!estimate) throw new ProtoError(`Unknown estimate ${args.id}. Existing: ${ESTIMATES.map((e) => e.id).join(", ")}.`)
    return {
      text: [
        estimateLine(estimate),
        ...estimate.lines.map((l) => `  · ${l.label} : ${l.qty} × ${euros(l.unitHt)} = ${euros(l.qty * l.unitHt)}`),
        `  Total : ${euros(total(estimate))}`,
      ].join("\n"),
    }
  },
})

// --- Mail ------------------------------------------------------------------------------------------

const createDraft = defineFunction({
  name: "mail.create_draft",
  connector: "mail",
  class: "write",
  description: "Saves an email draft (not sent) and returns its id. Use it to prepare an email the user will review before any sending.",
  schema: z.strictObject({
    to: z.email().describe("Recipient email address"),
    subject: z.string().min(1).max(200).describe("Subject line"),
    body: z.string().min(1).max(20_000).describe("Plain-text body"),
  }),
  examples: [{ to: "sophie@valbrune.test", subject: "Votre devis DEV-2026-041", body: "Bonjour Sophie, …" }],
  refusals: ["invalid email address", "mail not open to your team"],
  run: async ({ db, identity }, args) => {
    const id = `dr_${randomBytes(4).toString("hex")}`
    must(
      await db.from("mail_drafts").insert({ id, org_id: identity.org.id, user_id: identity.user.id, to_addr: args.to, subject: args.subject, body: args.body }),
      "mail_drafts"
    )
    return { text: `Draft ${id} saved for ${args.to}: « ${args.subject} ». Not sent.` }
  },
})

async function loadDraft({ db, identity }: Parameters<typeof createDraft.run>[0], id: string) {
  const draft = must(await db.from("mail_drafts").select("*").eq("id", id.trim()).eq("org_id", identity.org.id).maybeSingle(), "mail_drafts")
  if (!draft) throw new ProtoError(`Unknown draft ${id}. Create one with mail.create_draft.`)
  if (draft.status === "sent") throw new ProtoError(`Draft ${id} was already sent on ${draft.sent_at?.slice(0, 16)}.`)
  return draft
}

const sendDraft = defineFunction({
  name: "mail.send_draft",
  connector: "mail",
  class: "sensitive",
  description:
    "Sends an email draft. Sensitive: the first call returns a summary and sends nothing; call again with confirm: true only after the user explicitly approved it.",
  schema: z.strictObject({ id: z.string().min(1).describe("Draft id returned by mail.create_draft, e.g. dr_1a2b3c4d") }),
  examples: [{ id: "dr_1a2b3c4d" }],
  refusals: ["without confirm: nothing is sent, a summary is returned", "unknown or already sent draft"],
  summarize: async (ctx, args) => {
    const draft = await loadDraft(ctx, args.id)
    return [`About to send draft ${draft.id}:`, `To: ${draft.to_addr}`, `Subject: ${draft.subject}`, `Body: ${draft.body.slice(0, 300)}${draft.body.length > 300 ? "…" : ""}`].join("\n")
  },
  run: async (ctx, args) => {
    const draft = await loadDraft(ctx, args.id)
    const sent = one(
      await ctx.db.from("mail_drafts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "draft").select("id").single(),
      "mail_drafts"
    )
    return { text: `Draft ${sent.id} sent to ${draft.to_addr} (${SIMULATED}).` }
  },
})

// --- Slack -----------------------------------------------------------------------------------------

const postMessage = defineFunction({
  name: "slack.post_message",
  connector: "slack",
  class: "write",
  description: "Posts a message to a Slack channel of the organisation. Use it only after the user approved the text.",
  schema: z.strictObject({
    channel: z.string().regex(/^#[a-z0-9_-]{1,80}$/).describe("Channel name with #, e.g. #ventes"),
    text: z.string().min(1).max(4000).describe("Message text"),
  }),
  examples: [{ channel: "#ventes", text: "Point pipeline : 5 prospects à traiter, 4 devis en attente." }],
  refusals: ["channel without # or with spaces", "slack not open to your team"],
  run: async (_ctx, args) => ({ text: `Posted to ${args.channel}, ${args.text.length} characters (${SIMULATED}).` }),
})

// --- Sondes de mesure (mesures 3 et 4 du doc fonctionnel) ------------------------------------------

const CANARY_EVERY = 1000

/** Texte d'exactement `chars` caractères, un canari `[C:proto:<position>]` tous les 1 000 caractères. */
export function payload(chars: number): string {
  let text = ""
  for (let offset = 0; offset < chars; offset += CANARY_EVERY) {
    const canary = `[C:proto:${String(offset).padStart(6, "0")}]`
    text += (canary + " lorem ipsum dolor sit amet".repeat(40)).slice(0, CANARY_EVERY)
  }
  return text.slice(0, chars)
}

const probePayload = defineFunction({
  name: "probe.payload",
  connector: "probe",
  class: "read",
  description:
    "Measurement probe: returns exactly `chars` characters with a canary [C:proto:<position>] every 1,000 characters. Use it only when asked to measure the largest result read in full.",
  schema: z.strictObject({ chars: z.number().int().min(1).max(200_000).describe("Number of characters to return (max 200000)") }),
  examples: [{ chars: 25_000 }],
  refusals: ["probe not open to your team"],
  run: async (_ctx, args) => ({ text: payload(args.chars) }),
})

const probeEcho = defineFunction({
  name: "probe.echo",
  connector: "probe",
  class: "read",
  description:
    "Measurement probe: reports the length of the text it received, its first and last 40 characters and the canaries it contains. Use it only when asked to measure the largest argument written in one call.",
  schema: z.strictObject({ text: z.string().max(1_000_000).describe("Text to measure") }),
  examples: [{ text: "[C:proto:000000] …" }],
  refusals: ["probe not open to your team"],
  run: async (_ctx, args) => {
    const canaries = args.text.match(/\[C:proto:\d{6}\]/g) ?? []
    return {
      text: [
        `Received ${args.text.length} characters.`,
        `First 40: ${args.text.slice(0, 40)}`,
        `Last 40: ${args.text.slice(-40)}`,
        `Canaries: ${canaries.length}${canaries.length ? ` (first ${canaries[0]}, last ${canaries[canaries.length - 1]})` : ""}`,
      ].join("\n"),
    }
  },
})

export const SIMULATED_FUNCTIONS = [listEstimates, getEstimate, createDraft, sendDraft, postMessage, probePayload, probeEcho]
