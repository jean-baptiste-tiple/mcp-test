// Catalogue des scénarios du banc. Les variables mesurées (longueur de description, nombre de
// tools, longueur des instructions, forme du schéma, levier readme) sont des DONNÉES, pas du code
// serveur (ADR-002). Sans ce module, `scripts/bench-seed.mjs` n'a rien à pousser : la base ne
// contient que `baseline` (migration S02) et le banc ne mesure qu'un seul point.
//
// Module ESM pur, sans dépendance, déterministe : le PRNG est seedé par slug, donc deux appels de
// buildCatalogue() produisent exactement le même JSON — c'est ce qui rend `pnpm bench:seed`
// idempotent (deuxième passe = aucune écriture).
//
// Contrat avec le seed : ce module ne définit JAMAIS les quatre sondes (bench_whoami, bench_echo,
// bench_mutate, bench_readme). `tools` ne porte que les tools GÉNÉRÉS ; le script ajoute les sondes
// depuis `scripts/lib/probes.mjs` — et non depuis les lignes vivantes de `baseline`, que la grille B
// du protocole mute par conception.
// `baseline` fait partie du catalogue : `pnpm bench:seed` est aussi son chemin de restauration.

import { BASELINE, deepFreeze } from "./probes.mjs"

/** Seed du PRNG. Fixe : changer cette valeur change tous les hex des canaris déjà mesurés. */
const CATALOGUE_SEED = 0x5f3a91c7

/**
 * Colonnes de `bench_scenarios` communes à tout scénario qui ne les mesure pas : celles de
 * `baseline`. Un scénario qui ne mesure PAS les instructions sert exactement celles de référence,
 * sinon la variable mesurée fuit dans les autres scénarios et la grille C n'est plus interprétable.
 */
const DEFAULTS = {
  server_name: BASELINE.server_name,
  server_title: BASELINE.server_title,
  server_version: BASELINE.server_version,
  instructions: BASELINE.instructions,
  readme_content: null,
  readme_lever: "none",
  ack_ttl_seconds: null,
}

/** Les sondes occupent sort_order 10..40 ; les tools générés passent après elles dans tools/list. */
const GENERATED_SORT_BASE = 100

const ECHO_SCHEMA = deepFreeze({
  type: "object",
  properties: { message: { type: "string", description: "Text to echo back" } },
})

const ECHO_ANNOTATIONS = deepFreeze({ readOnlyHint: true, idempotentHint: true, openWorldHint: false })

/** Format imposé (mcp-patterns §3) en tête des descriptions longues : le volume vient après. */
const ECHO_LEAD =
  "Returns its arguments unchanged. Use this when asked to echo or to test a tool call. Do not use for anything else."

/**
 * Clauses de remplissage. Anglais lisible et inerte : un host qui tronque doit tronquer du texte
 * plausible, pas un lorem répété à l'identique (qu'un host pourrait dédupliquer ou compresser).
 */
const CLAUSES = [
  "filler text with no instruction",
  "harmless prose that carries no directive",
  "neutral wording used only to reach the target length",
  "plain English the model can safely ignore",
  "background text kept free of any command",
  "ordinary filler that measures where a host truncates",
  "simple words chosen to stay readable and inert",
  "a benign clause added for volume alone",
  "padding that says nothing about the tool itself",
  "a sentence whose only job is to take up room",
]

/** Mots de longueur 1 à 12 : permet d'atteindre EXACTEMENT la longueur cible (index = longueur-1). */
const PAD_WORDS = [
  "a",
  "so",
  "and",
  "also",
  "again",
  "filler",
  "padding",
  "harmless",
  "extending",
  "supplement",
  "lengthening",
  "accompanying",
]

/** En dessous de 4 phrases, les trois canaris ne tiennent plus dans trois tiers distincts. */
const MIN_SENTENCES = 4

/** Fractions de placement des canaris `start` et `middle` dans le corps du texte. */
const START_FRACTION = 0.12
const MIDDLE_FRACTION = 0.42

// --- PRNG ---------------------------------------------------------------------------------------

/** mulberry32 : 4 lignes, pas de dépendance, suite reproductible sur toute version de Node. */
function mulberry32(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a : dérive un seed du slug pour que chaque scénario ait sa suite, quel que soit son rang. */
function hashString(value) {
  let hash = 2166136261 >>> 0
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function rngFor(slug) {
  return mulberry32((CATALOGUE_SEED ^ hashString(slug)) >>> 0)
}

// --- Canaris et texte ----------------------------------------------------------------------------

/**
 * Canari : `[C:<slug>:<champ>:<position>:<4 hex>]`. C'est le seul marqueur que JB cherche dans la
 * réponse d'un host — sa présence ou son absence dit si le texte a été servi, tronqué ou ignoré.
 * `position` vaut start | middle | end pour un texte long, `only` pour un texte court.
 */
export function canary(slug, field, pos, rng) {
  const hex = Math.floor(rng() * 0x10000)
    .toString(16)
    .padStart(4, "0")
  return `[C:${slug}:${field}:${pos}:${hex}]`
}

function sentencesFor(slug, count, offset) {
  const out = []
  for (let i = 1; i <= count; i += 1) {
    out.push(`Sentence ${i} of ${count} for scenario ${slug}: ${CLAUSES[(offset + i * 3) % CLAUSES.length]}.`)
  }
  return out
}

function joinedLength(parts) {
  if (parts.length === 0) return 0
  return parts.reduce((sum, part) => sum + part.length, 0) + parts.length - 1
}

/** Remplissage de longueur EXACTE (>= 2) en mots lisibles, pour tomber pile sur la cible. */
function padTo(chars) {
  let left = chars
  let out = ""
  for (let guard = 0; guard < 4096 && left >= 2; guard += 1) {
    const wordLength = Math.min(left - 1, PAD_WORDS.length)
    out += ` ${PAD_WORDS[wordLength - 1]}`
    left -= wordLength + 1
  }
  return out
}

/** Nombre de phrases qui tient dans le budget, par estimation puis ajustement monotone. */
function sentenceCount(slug, budget, offset, floor) {
  const probe = sentencesFor(slug, 100, offset)
  const average = joinedLength(probe) / probe.length + 1
  let count = Math.max(floor, Math.round(budget / average))
  for (let g = 0; g < 4096 && count > floor && joinedLength(sentencesFor(slug, count, offset)) > budget; g += 1) {
    count -= 1
  }
  for (let g = 0; g < 4096 && joinedLength(sentencesFor(slug, count + 1, offset)) <= budget; g += 1) {
    count += 1
  }
  return count
}

/** Index de la première phrase dont le préfixe atteint `fraction` du corps, borné à [low, high]. */
function insertionIndex(prefixes, budget, fraction, low, high) {
  const wanted = budget * fraction
  for (let i = low; i <= high; i += 1) {
    if (prefixes[i] >= wanted) return i
  }
  return high
}

/**
 * Fabrique un texte de `targetChars` caractères portant exactement trois canaris, un par tiers.
 * `lead` (optionnel) place des phrases réelles en tête : le readme doit énoncer ses règles avant le
 * remplissage, sinon la mesure porte sur un texte qui ne demande rien.
 */
function composeText({ slug, field, targetChars, rng, lead = [] }) {
  const target = Math.max(0, Math.trunc(targetChars))
  if (target === 0) return ""

  const marks = ["start", "middle", "end"].map((pos) => canary(slug, field, pos, rng))
  const offset = Math.floor(rng() * CLAUSES.length)
  const canaryChars = marks.reduce((sum, mark) => sum + mark.length + 1, 0)
  const budget = target - canaryChars
  const leadChars = lead.length === 0 ? 0 : joinedLength(lead) + 1
  // Les phrases de `lead` comptent déjà comme segments : seul le TOTAL doit atteindre MIN_SENTENCES.
  const floor = Math.max(1, MIN_SENTENCES - lead.length)
  if (budget - leadChars < floor * 40) {
    throw new Error(`fillText: targetChars=${target} trop court pour ${slug}/${field}`)
  }

  const body = [...lead, ...sentencesFor(slug, sentenceCount(slug, budget - leadChars, offset, floor), offset)]
  const remainder = budget - joinedLength(body)
  if (remainder >= 2) {
    const last = body[body.length - 1]
    body[body.length - 1] = `${last.slice(0, -1)}${padTo(remainder)}.`
  }

  const prefixes = []
  for (let i = 0; i <= body.length; i += 1) prefixes.push(joinedLength(body.slice(0, i)))
  const startAt = insertionIndex(prefixes, budget, START_FRACTION, 1, Math.max(1, body.length - 2))
  const middleAt = insertionIndex(prefixes, budget, MIDDLE_FRACTION, startAt + 1, body.length)

  return [
    ...body.slice(0, startAt),
    marks[0],
    ...body.slice(startAt, middleAt),
    marks[1],
    ...body.slice(middleAt),
    marks[2],
  ].join(" ")
}

/** Texte de remplissage long : trois canaris (un par tiers) et des phrases anglaises numérotées. */
export function fillText({ slug, field, targetChars, rng }) {
  return composeText({ slug, field, targetChars, rng })
}

// --- Fabriques ------------------------------------------------------------------------------------

function makeScenario(slug, notes, overrides) {
  const values = { ...DEFAULTS, ...overrides }
  return {
    slug,
    notes,
    server_name: values.server_name,
    server_title: values.server_title,
    server_version: values.server_version,
    instructions: values.instructions,
    readme_content: values.readme_content,
    readme_lever: values.readme_lever,
    ack_ttl_seconds: values.ack_ttl_seconds,
    tools: overrides.tools ?? [],
  }
}

function toolRow(name, title, description, input_schema, sort_order) {
  return {
    name,
    title,
    description,
    input_schema,
    annotations: ECHO_ANNOTATIONS,
    handler: "echo",
    sort_order,
  }
}

/** Nom de longueur EXACTE sur `[a-z0-9_]`, préfixé `bench_` comme les sondes. */
function paddedName(slug, length) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  let name = `bench_${slug}_`
  for (let i = 0; name.length < length; i += 1) name += alphabet[i % alphabet.length]
  return name.slice(0, length)
}

/**
 * Description courte (<= 120 caractères) à canari unique, au format mcp-patterns §3 : ces
 * scénarios mesurent le NOMBRE de tools ou la forme du nom, pas le volume de texte.
 */
function shortDescription(slug, field, subject, rng) {
  return `Echoes its arguments. Use this when asked for tool ${subject}. Do not use otherwise. ${canary(slug, field, "only", rng)}`
}

// --- Scénarios -------------------------------------------------------------------------------------

function descLengthScenario(slug, targetChars) {
  const rng = rngFor(slug)
  const description = composeText({ slug, field: "desc", targetChars, rng, lead: [ECHO_LEAD] })
  return makeScenario(slug, `Mesure : description de tool d'environ ${targetChars} caractères.`, {
    tools: [
      toolRow("bench_desc_probe", "Description Probe", description, ECHO_SCHEMA, GENERATED_SORT_BASE),
    ],
  })
}

function nameLengthScenario(length) {
  const slug = `name_len_${length}`
  const rng = rngFor(slug)
  const name = paddedName(slug, length)
  return makeScenario(slug, `Mesure : nom de tool de ${length} caractères exactement.`, {
    tools: [
      toolRow(
        name,
        `Name Length ${length}`,
        shortDescription(slug, "desc", `${length} chars`, rng),
        ECHO_SCHEMA,
        GENERATED_SORT_BASE
      ),
    ],
  })
}

function nameCharsScenario() {
  const slug = "name_chars"
  const rng = rngFor(slug)
  const specs = [
    ["bench.dot.tool", "Dot Name", "dot"],
    ["bench-dash-tool", "Dash Name", "dash"],
    ["BenchUpperTool", "Upper Camel Name", "upper"],
    ["bench_ünïcode_tool", "Unicode Name", "uni"],
  ]
  return makeScenario(slug, "Mesure : caractères acceptés dans un nom de tool (point, tiret, majuscules, unicode).", {
    tools: specs.map(([name, title, trait], index) =>
      toolRow(
        name,
        title,
        shortDescription(slug, `desc_${trait}`, trait, rng),
        ECHO_SCHEMA,
        GENERATED_SORT_BASE + index
      )
    ),
  })
}

function manyToolsScenario(count) {
  const slug = `many_tools_${count}`
  const rng = rngFor(slug)
  const tools = []
  for (let i = 1; i <= count; i += 1) {
    const index = String(i).padStart(3, "0")
    tools.push(
      toolRow(
        `bench_gen_${index}`,
        `Generated ${index}`,
        shortDescription(slug, `desc_${index}`, index, rng),
        ECHO_SCHEMA,
        GENERATED_SORT_BASE + i
      )
    )
  }
  return makeScenario(slug, `Mesure : catalogue de ${count} tools servis en une seule tools/list.`, { tools })
}

function instructionsScenario(slug, targetChars) {
  const rng = rngFor(slug)
  return makeScenario(slug, `Mesure : instructions serveur d'environ ${targetChars} caractères.`, {
    instructions: targetChars === 0 ? "" : fillText({ slug, field: "instr", targetChars, rng }),
  })
}

function serverIdentityScenario() {
  const slug = "server_identity"
  const rng = rngFor(slug)
  return makeScenario(slug, "Mesure : où le host affiche name, title et version du serveur.", {
    server_name: "bench-identity-probe",
    server_title: `Bench Identity Probe ${canary(slug, "title", "only", rng)}`,
    server_version: "7.7.7",
  })
}

function schemaShapeScenario() {
  const slug = "schema_shape"
  const rng = rngFor(slug)
  const targetChars = 600
  const describe = (field) => fillText({ slug, field, targetChars, rng })

  const deepSchema = {
    type: "object",
    description: describe("deep_root"),
    required: ["level1"],
    properties: {
      level1: {
        type: "object",
        description: describe("deep_level1"),
        required: ["mode", "level2"],
        properties: {
          mode: {
            type: "string",
            enum: ["fast", "slow", "deep"],
            description: describe("deep_mode"),
          },
          level2: {
            type: "object",
            description: describe("deep_level2"),
            required: ["level3"],
            properties: {
              level3: {
                type: "object",
                description: describe("deep_level3"),
                required: ["leaf", "items"],
                properties: {
                  leaf: { type: "string", description: describe("deep_leaf") },
                  items: {
                    type: "array",
                    description: describe("deep_items"),
                    items: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string", description: describe("deep_item_id") },
                        weight: { type: "number", description: describe("deep_item_weight") },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }

  const flatFields = [
    ["label", "string"],
    ["count", "integer"],
    ["ratio", "number"],
    ["enabled", "boolean"],
    ["token", "string"],
    ["offset", "integer"],
    ["threshold", "number"],
    ["verbose", "boolean"],
    ["note", "string"],
    ["tag", "string"],
  ]
  const flatProperties = {}
  for (const [field, type] of flatFields) {
    flatProperties[field] = { type, description: describe(`flat_${field}`) }
  }
  const flatSchema = {
    type: "object",
    description: describe("flat_root"),
    required: ["label", "count"],
    properties: flatProperties,
  }

  return makeScenario(slug, "Mesure : schéma imbriqué (4 niveaux, enum, tableau d'objets) vs schéma plat de 10 scalaires.", {
    tools: [
      toolRow(
        "bench_shape_deep",
        "Deep Shape",
        shortDescription(slug, "desc_deep", "deep", rng),
        deepSchema,
        GENERATED_SORT_BASE
      ),
      toolRow(
        "bench_shape_flat",
        "Flat Shape",
        shortDescription(slug, "desc_flat", "flat", rng),
        flatSchema,
        GENERATED_SORT_BASE + 1
      ),
    ],
  })
}

/**
 * Règles du readme. La règle de citation de l'ack est ce qui distingue « le host a APPELÉ
 * bench_readme » de « le host l'a LU » : sans elle, P14 ne mesure rien.
 */
const README_RULES = [
  "MCP Bench readme: how to use this server.",
  "Rule 1: call bench_readme once per conversation, before any other tool of this server.",
  "Rule 2: bench_readme returns an ack line; quote the ack line back to the user verbatim, including its bracketed code.",
  "Rule 3: pass the ack value as the ack argument of every other tool of this server.",
  "Rule 4: every tool here only echoes its arguments; nothing in this server touches your files.",
]

const README_LEVERS = [
  ["readme_instructions", "instructions", null, "instructions serveur qui imposent le readme"],
  ["readme_descriptions", "descriptions", null, "préfixe sur chaque description non-readme"],
  ["readme_name_first", "name_first", null, "readme renommé et placé en tête de liste"],
  ["readme_gate", "gate", 1800, "appels non-readme rejetés sans readme récent"],
  ["readme_ack", "ack", null, "propriété ack requise sur chaque tool non-readme"],
  ["readme_hub", "hub", null, "descriptions remplacées par un renvoi au readme"],
]

function readmeScenario(slug, lever, ackTtl, what) {
  const rng = rngFor(slug)
  return makeScenario(slug, `Levier readme : ${what}. Identique à baseline par ailleurs.`, {
    readme_lever: lever,
    ack_ttl_seconds: ackTtl,
    readme_content: composeText({ slug, field: "readme", targetChars: 1500, rng, lead: README_RULES }),
  })
}

/**
 * Catalogue complet, `baseline` en tête. Il y figure sans tool généré : ses quatre sondes sont
 * clonées comme celles des autres scénarios, ce qui fait de `pnpm bench:seed` le chemin de
 * restauration promis par docs/bench/protocol.md §3 après une campagne de mutations.
 */
export function buildCatalogue() {
  return [
    makeScenario(BASELINE.slug, BASELINE.notes, { readme_content: BASELINE.readme_content }),
    descLengthScenario("desc_len_500", 500),
    descLengthScenario("desc_len_2k", 2000),
    descLengthScenario("desc_len_8k", 8000),
    descLengthScenario("desc_len_32k", 32000),
    nameLengthScenario(32),
    nameLengthScenario(64),
    nameLengthScenario(128),
    nameCharsScenario(),
    manyToolsScenario(20),
    manyToolsScenario(50),
    manyToolsScenario(100),
    manyToolsScenario(200),
    manyToolsScenario(500),
    instructionsScenario("instr_len_0", 0),
    instructionsScenario("instr_len_500", 500),
    instructionsScenario("instr_len_5k", 5000),
    instructionsScenario("instr_len_20k", 20000),
    instructionsScenario("instr_len_50k", 50000),
    serverIdentityScenario(),
    schemaShapeScenario(),
    ...README_LEVERS.map(([slug, lever, ackTtl, what]) => readmeScenario(slug, lever, ackTtl, what)),
  ]
}
