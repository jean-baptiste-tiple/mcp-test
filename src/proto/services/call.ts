// <prefix>_call (E04-S04 ; doc fonctionnel, « Sûreté de la reconnaissance » : le serveur garde la
// main). La fonction existe, l'équipe y a droit, les arguments sont valides, une fonction sensible
// attend l'accord de l'utilisateur. Sans ce service, un appel ne passerait par aucun de ces contrôles.
import type { ProtoDb } from "../db"
import type { FunctionClass, ProtoFunction } from "../functions/define"
import { getFunction } from "../functions/registry"
import type { Identity, Team } from "../identity"
import { ProtoError, type ServiceResult } from "../result"
import { parseInput } from "../schemas"

const NEEDS: Record<FunctionClass, "read" | "write"> = { read: "read", write: "write", sensitive: "write" }

/** Première équipe de l'utilisateur (la sienne par défaut d'abord) qui a le droit requis sur le connecteur. */
function runningTeam(identity: Identity, fn: ProtoFunction): Team {
  const needed = NEEDS[fn.class]
  const allows = (t: Team) => t.connectors[fn.connector] === "write" || (needed === "read" && t.connectors[fn.connector] === "read")
  const mine = identity.teams.find((t) => t.member && allows(t))
  if (mine) return mine

  // L'équipe qui tient le connecteur en écriture en est la propriétaire : c'est elle qu'on nomme.
  const owner = identity.teams.find((t) => t.connectors[fn.connector] === "write") ?? identity.teams.find(allows)
  if (!owner) throw new ProtoError(`The ${fn.connector} connector is not enabled for ${identity.org.name}.`)
  const lead = owner.leadName ? ` (lead: ${owner.leadName})` : ""
  throw new ProtoError(`${fn.connector} (${needed}) is open to team ${owner.name}${lead}, not to your teams. Ask them for access.`)
}

export async function callFunction(
  db: ProtoDb,
  identity: Identity,
  input: { function: string; arguments?: Record<string, unknown>; confirm?: boolean }
): Promise<ServiceResult> {
  const p = identity.org.prefix
  const fn = getFunction(input.function)
  if (!fn) throw new ProtoError(`Unknown function ${input.function}. Use ${p}_find with type function.`)

  const parsed = parseInput(fn.schema, input.arguments ?? {})
  if ("issues" in parsed) {
    throw new ProtoError(`Invalid arguments for ${fn.name}: ${parsed.issues}. Read the contract with ${p}_read {"path": "${fn.name}"}.`)
  }

  // Les tableaux suivent les droits de leur nœud (table.ts) ; les connecteurs, ceux des équipes.
  const team = fn.connector === "table" ? null : runningTeam(identity, fn)
  const ctx = { db, identity }

  if (fn.class === "sensitive" && input.confirm !== true) {
    const summary = await fn.summarize!(ctx, parsed.data as never)
    return {
      text: `${summary}\n\nNothing was sent. Show this to the user and ask for explicit approval, then call again with confirm: true.`,
      target: fn.name,
      teamId: team?.id ?? null,
    }
  }

  const output = await fn.run(ctx, parsed.data as never)
  return { text: output.text, target: fn.name, teamId: output.teamId ?? team?.id ?? null }
}
