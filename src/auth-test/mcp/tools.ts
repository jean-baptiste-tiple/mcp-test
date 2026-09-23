// Les deux outils du serveur auth-test, calculés par organisation (ADR-004 §4, FR-AUTH-06) : le préfixe de
// l'hôte (`acme_`, `delta_`) et le nom du client entrent dans les noms et les descriptions. Sans ce module,
// deux hôtes branchés dans le même host exposeraient les mêmes noms, et rien ne dirait au modèle quel
// connecteur interroger. Règles mesurées en E01 (mcp-patterns §2.1, §3) : anglais, < 1 000 caractères,
// l'essentiel en première phrase, `.describe()` sur chaque champ, `securitySchemes` oauth2 (ChatGPT).
import * as z from "zod/v4"

import type { OauthTestOrgRow } from "@/types/oauth-test-database"

export type ToolOrg = Pick<OauthTestOrgRow, "prefix" | "name">

const TOOL_KEYS = ["whoami", "echo"] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

/** Plafond des arguments d'un appel, en octets UTF-8 : au-delà, refus actionnable avant tout traitement. */
export const MAX_ARGS_BYTES = 64 * 1024

export const WhoamiInput = z.object({
  note: z
    .string()
    .max(200)
    .optional()
    .describe('Optional short label repeated in the result, e.g. the host and model you run on ("claude.ai/opus"). Default: none.'),
})

// Champs libres : echo rend tout ce qu'il reçoit, `message` compris.
export const EchoInput = z.looseObject({
  message: z.string().describe("Text to send back unchanged. Any other field you add is returned too."),
})

export type ToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; idempotentHint: boolean; openWorldHint: boolean }
  _meta: { securitySchemes: { type: "oauth2" }[] }
}

/** Une phrase : claude.ai ne montre jamais les instructions (E01), les descriptions portent l'essentiel. */
export function serverInstructions(org: ToolOrg): string {
  return `${org.name} sign-in test server: ${org.prefix}_whoami shows who you are signed in as and whether you are a member of ${org.name}, and ${org.prefix}_echo returns the arguments you send.`
}

function descriptions(org: ToolOrg): Record<ToolKey, string> {
  const p = org.prefix
  return {
    whoami: `Shows who you are signed in as on the ${org.name} connector: your account, whether you are a member of ${org.name}, your access token's claims (issuer, audience, client, session, expiry) and the request as the server received it. Use this when the user asks who they are connected as, whether the ${org.name} sign-in works, or to check the connection after signing in. Do not use to send a message through the connector (use ${p}_echo).`,
    echo: `Returns the arguments you pass, unchanged, as the ${org.name} server received them. Use this when the user asks to test the ${org.name} connector or to send a message through it. Do not use to check who is signed in (use ${p}_whoami).`,
  }
}

const TITLES: Record<ToolKey, string> = { whoami: "Who am I", echo: "Echo" }

/** JSON Schema servi dans tools/list, tiré du schéma Zod qui valide l'appel ; sans `$schema`, que les hosts n'utilisent pas. */
function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = z.toJSONSchema(schema)
  delete json.$schema
  return json
}

export function buildTools(org: ToolOrg): ToolDefinition[] {
  const text = descriptions(org)
  const inputs: Record<ToolKey, z.ZodType> = { whoami: WhoamiInput, echo: EchoInput }
  return TOOL_KEYS.map((key) => ({
    name: `${org.prefix}_${key}`,
    title: `${org.name}: ${TITLES[key]}`,
    description: text[key],
    inputSchema: toInputSchema(inputs[key]),
    // Rien n'est écrit au nom de l'utilisateur ; le journal est la trace du serveur, pas un effet de l'outil.
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    // Sans cette déclaration, ChatGPT n'affiche jamais « Se connecter » (mcp-patterns §3).
    _meta: { securitySchemes: [{ type: "oauth2" }] },
  }))
}

/** `acme_whoami` → `whoami` ; tout autre nom, dont ceux d'un autre préfixe → null. */
export function toolKey(prefix: string, name: string): ToolKey | null {
  return TOOL_KEYS.find((key) => name === `${prefix}_${key}`) ?? null
}
