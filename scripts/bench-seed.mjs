#!/usr/bin/env node
// Pousse le catalogue (scripts/lib/catalogue.mjs) dans bench_scenarios / bench_tools. Sans ce
// script, activer un scénario dans Studio ne sert à rien : la base ne contient que `baseline`
// (migrations S02/S03) et il faudrait écrire 27 scénarios et ~1000 tools à la main.
//
// Deux règles qui tiennent tout le banc :
//  1. `is_active` n'est JAMAIS écrit — activer un scénario reste un geste explicite dans Studio ;
//     un seed pendant une campagne ne doit pas changer ce que le host voit.
//  2. Idempotent par comparaison : une ligne n'est écrite que si elle diffère, donc une deuxième
//     passe annonce 0 création, 0 mise à jour, 0 suppression. C'est le test de non-régression de
//     `pnpm bench:seed` exécuté au milieu d'une campagne.
//
// `baseline` est un scénario comme un autre : le seed le restaure (champs, sondes, readme) et
// supprime les tools qu'une campagne y a ajoutés — c'est la remise d'aplomb de protocol.md §3.
//
// Usage : pnpm bench:seed   (lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local)

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

import { buildCatalogue } from "./lib/catalogue.mjs"
import { PROBES } from "./lib/probes.mjs"

/** `version` est volontairement absent : il appartient à la ligne cible, pas à la copie. */
const TOOL_COLUMNS = ["name", "title", "description", "input_schema", "annotations", "handler", "sort_order"]
const SCENARIO_COLUMNS = [
  "notes",
  "server_name",
  "server_title",
  "server_version",
  "instructions",
  "readme_content",
  "readme_lever",
  "ack_ttl_seconds",
]
/** PostgREST encaisse mal un insert de 500 lignes d'un coup (payload + timeout). */
const INSERT_CHUNK = 200
/** Les ids d'un `.in()` partent dans l'URL : 50 uuid ≈ 1,9 ko, loin de la limite du proxy. */
const DELETE_CHUNK = 50

// --- Environnement --------------------------------------------------------------------------------

/**
 * Lecture manuelle de `.env.local` : `node scripts/*.mjs` ne passe pas par Next, qui est le seul à
 * charger ce fichier. Une dépendance (dotenv) pour douze lignes ne se justifie pas.
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    const unquoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value
    values[key] = unquoted
  }
  return values
}

function readCredentials() {
  const envPath = fileURLToPath(new URL("../.env.local", import.meta.url))
  const fileEnv = loadEnvFile(envPath)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SECRET_KEY
  const missing = []
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL")
  if (!secretKey) missing.push("SUPABASE_SECRET_KEY")
  if (missing.length > 0) {
    // Jamais la valeur : seulement le nom de la variable manquante (security-patterns).
    throw new Error(`variables manquantes (${missing.join(", ")}) — les définir dans .env.local ou l'environnement`)
  }
  return { url, secretKey }
}

// --- Comparaison ----------------------------------------------------------------------------------

/** Clés triées : jsonb renvoie ses clés dans son propre ordre, une comparaison naïve verrait un diff. */
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`
}

function pick(source, columns) {
  const out = {}
  for (const column of columns) out[column] = source[column] ?? null
  return out
}

function differs(current, wanted, columns) {
  return columns.some((column) => stableStringify(current[column] ?? null) !== stableStringify(wanted[column] ?? null))
}

// --- Accès base -------------------------------------------------------------------------------------

function unwrap(result, what) {
  if (result.error) throw new Error(`${what} : ${result.error.message}`)
  return result.data
}

async function syncScenario(db, scenario, counts) {
  const existing = unwrap(
    await db
      .from("bench_scenarios")
      .select(["id", "slug", ...SCENARIO_COLUMNS].join(", "))
      .eq("slug", scenario.slug)
      .maybeSingle(),
    `lecture du scénario ${scenario.slug}`
  )
  const wanted = pick(scenario, SCENARIO_COLUMNS)

  if (!existing) {
    // `is_active` est laissé au défaut de la colonne (false) : le script ne l'écrit jamais.
    const inserted = unwrap(
      await db.from("bench_scenarios").insert({ slug: scenario.slug, ...wanted }).select("id").single(),
      `insertion du scénario ${scenario.slug}`
    )
    counts.scenariosCreated += 1
    return inserted.id
  }

  if (differs(existing, wanted, SCENARIO_COLUMNS)) {
    unwrap(
      await db.from("bench_scenarios").update(wanted).eq("id", existing.id),
      `mise à jour du scénario ${scenario.slug}`
    )
    counts.scenariosUpdated += 1
  }
  return existing.id
}

async function syncTools(db, scenarioId, slug, wantedTools, counts) {
  const existing = unwrap(
    await db.from("bench_tools").select(["id", ...TOOL_COLUMNS].join(", ")).eq("scenario_id", scenarioId),
    `lecture des tools de ${slug}`
  )
  const byName = new Map(existing.map((tool) => [tool.name, tool]))
  const wantedNames = new Set(wantedTools.map((tool) => tool.name))

  const toInsert = []
  for (const tool of wantedTools) {
    const current = byName.get(tool.name)
    if (!current) {
      toInsert.push({ scenario_id: scenarioId, ...tool })
      continue
    }
    if (differs(current, tool, TOOL_COLUMNS)) {
      unwrap(await db.from("bench_tools").update(tool).eq("id", current.id), `mise à jour du tool ${slug}/${tool.name}`)
      counts.toolsUpdated += 1
    }
  }

  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    unwrap(await db.from("bench_tools").insert(toInsert.slice(i, i + INSERT_CHUNK)), `insertion des tools de ${slug}`)
  }
  counts.toolsInserted += toInsert.length

  const orphans = existing.filter((tool) => !wantedNames.has(tool.name)).map((tool) => tool.id)
  for (let i = 0; i < orphans.length; i += DELETE_CHUNK) {
    unwrap(
      await db
        .from("bench_tools")
        .delete()
        .eq("scenario_id", scenarioId)
        .in("id", orphans.slice(i, i + DELETE_CHUNK)),
      `suppression des tools orphelins de ${slug}`
    )
  }
  counts.toolsDeleted += orphans.length
}

// --- Entrée -------------------------------------------------------------------------------------------

async function main() {
  const { url, secretKey } = readCredentials()
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const catalogue = buildCatalogue()
  const probes = PROBES.map((probe) => pick(probe, TOOL_COLUMNS))
  console.log(
    `sondes : ${probes.length} depuis scripts/lib/probes.mjs (${probes.map((probe) => probe.name).join(", ")})`
  )

  const counts = {
    scenariosCreated: 0,
    scenariosUpdated: 0,
    toolsInserted: 0,
    toolsUpdated: 0,
    toolsDeleted: 0,
  }
  let manyTools500Chars = 0

  for (const scenario of catalogue) {
    const scenarioId = await syncScenario(db, scenario, counts)
    const wantedTools = [...scenario.tools.map((tool) => pick(tool, TOOL_COLUMNS)), ...probes]
    if (scenario.slug === "many_tools_500") manyTools500Chars = JSON.stringify(wantedTools).length
    await syncTools(db, scenarioId, scenario.slug, wantedTools, counts)
  }

  console.log(
    `scénarios : ${counts.scenariosCreated} créés, ${counts.scenariosUpdated} mis à jour, ` +
      `${catalogue.length - counts.scenariosCreated - counts.scenariosUpdated} inchangés (sur ${catalogue.length})`
  )
  console.log(
    `tools     : ${counts.toolsInserted} insérés, ${counts.toolsUpdated} mis à jour, ${counts.toolsDeleted} supprimés`
  )
  console.log(
    `many_tools_500 : ${manyTools500Chars} caractères de liste de tools (générés + sondes, avant mise en forme MCP)`
  )
  console.log("baseline restauré (champs + 4 sondes) ; la colonne is_active n'a jamais été écrite.")
}

main().catch((error) => {
  console.error(`✗ bench:seed : ${error.message}`)
  process.exitCode = 1
})
