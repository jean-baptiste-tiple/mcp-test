// <prefix>_feedback (doc fonctionnel, « Observabilité ») : le retour des assistants, recoupé avec le
// journal avant toute décision. Sans lui, une friction vue par le modèle ne laisse aucune trace.
import type { ProtoDb } from "../db"
import { one } from "../db"
import type { Identity } from "../identity"
import type { ServiceResult } from "../result"

export async function recordFeedback(
  db: ProtoDb,
  identity: Identity,
  input: { type: "friction" | "gap" | "error"; text: string },
  ctx: string
): Promise<ServiceResult> {
  const row = one(
    await db
      .from("feedback")
      .insert({ org_id: identity.org.id, user_id: identity.user.id, ctx, type: input.type, text: input.text })
      .select("id")
      .single(),
    "feedback"
  )
  const ticket = `FB-${String(row.id).padStart(4, "0")}`
  return { text: `Ticket ${ticket} recorded.`, target: ticket }
}
