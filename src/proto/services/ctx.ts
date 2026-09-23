// Le code ctx (architecture §9.4) : émis par context, exigé par les cinq autres outils, invalidé
// quand la version des règles de l'organisation change. C'est le levier mesuré 9 fois sur 9 en E01
// (champ requis dont la valeur vient d'un de nos outils) : sans ce module, rien ne force le modèle
// à relire le contexte à chaque conversation.
import { randomInt } from "node:crypto"

import type { ProtoDb } from "../db"
import { must, one } from "../db"
import type { Identity } from "../identity"
import { ProtoError } from "../result"

/** Base 32 de Crockford : ni I, L, O, U, lisible et recopiable par un modèle. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const PG_UNIQUE_VIOLATION = "23505"
/** Check `ctx.code` de la migration proto. */
const CODE_FORMAT = /^[0-9A-Z]{4}-[0-9A-Z]{4}$/

export function missingCtx(prefix: string): string {
  return `Missing or unknown ctx. Call ${prefix}_context first and pass its ctx code.`
}

export function staleCtx(prefix: string): string {
  return `context has changed, call ${prefix}_context again`
}

function newCode(): string {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")
  return `${pick()}-${pick()}`
}

/** Crée le code de la conversation, à la version des règles lue maintenant. */
export async function issueCtx(db: ProtoDb, identity: Identity, userAgent: string | null): Promise<string> {
  const org = one(await db.from("orgs").select("rules_version").eq("id", identity.org.id).single(), "orgs")
  // 32^8 codes : une collision est improbable, une seconde impossible en pratique.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const code = newCode()
    const { error } = await db.from("ctx").insert({
      code,
      org_id: identity.org.id,
      user_id: identity.user.id,
      rules_version: org.rules_version,
      user_agent: userAgent,
    })
    if (!error) return code
    if (error.code !== PG_UNIQUE_VIOLATION) must({ data: null, error }, "ctx")
  }
  throw new Error("ctx code collision")
}

/** Refuse un code absent, inconnu, d'un autre utilisateur, ou émis sous d'autres règles. */
export async function requireCtx(db: ProtoDb, identity: Identity, code: unknown): Promise<string> {
  const prefix = identity.org.prefix
  // Forme vérifiée avant la base : un ctx de 1 Mo partirait dans l'URL PostgREST et finirait en
  // « Internal error » au lieu de la consigne d'appeler context.
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : ""
  if (!CODE_FORMAT.test(normalized)) throw new ProtoError(missingCtx(prefix))

  const [ctx, org] = await Promise.all([
    db.from("ctx").select("user_id, rules_version").eq("code", normalized).maybeSingle(),
    db.from("orgs").select("rules_version").eq("id", identity.org.id).single(),
  ])
  const row = must(ctx, "ctx")
  if (!row || row.user_id !== identity.user.id) throw new ProtoError(missingCtx(prefix))
  if (row.rules_version !== one(org, "orgs").rules_version) throw new ProtoError(staleCtx(prefix))
  return normalized
}
