#!/usr/bin/env node
// Harnais des campagnes Claude Code du banc (doc : docs/bench/harnais.md). Sans lui, une campagne
// `claude -p` se rejouait à la main ou avec des scripts jetables, perdus après E01, E03-S05 et E04-S06.
//
// Usage :
//   pnpm bench:cc config --server acme=https://…/mcp --server delta=https://…/mcp [--out .bench/cc/mcp.json]
//   pnpm bench:cc run <plan.json> [--only D1,I3] [--models sonnet,opus] [--out <dossier>] [--dry-run]
//   (un plan exécute ses commandes `before` dans un shell : ne lancer qu'un plan relu)
//   pnpm bench:cc analyze <dossier de runs> [--write <regex>] [--match <regex>]

import { spawn, spawnSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, delimiter, dirname, join, resolve } from "node:path"

import {
  analyzeRun,
  checkCliVersion,
  claudeArgs,
  expandPlan,
  formatCommand,
  mcpConfig,
  parseServerSpecs,
  promptsFromGoldenQueries,
  resolveClaudeBin,
  toCsv,
  toMarkdown,
} from "./lib/cc-harness.mjs"

const [command, ...rest] = process.argv.slice(2)
const VALUE_OPTIONS = new Set(["--out", "--only", "--models", "--server", "--write", "--match"])
const positional = rest.filter((arg, i) => !arg.startsWith("--") && !VALUE_OPTIONS.has(rest[i - 1]))
const option = (name) => {
  const index = rest.indexOf(`--${name}`)
  return index === -1 ? undefined : rest[index + 1]
}
const options = (name) => rest.flatMap((arg, i) => (arg === `--${name}` ? [rest[i + 1]] : []))

function fail(message) {
  console.error(message)
  process.exit(1)
}

function claudeBin() {
  return resolveClaudeBin({
    platform: process.platform,
    pathEntries: (process.env.PATH ?? "").split(delimiter).filter(Boolean),
    exists: existsSync,
  })
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-")
}

function config() {
  const out = resolve(option("out") ?? ".bench/cc/mcp.json")
  const servers = parseServerSpecs(options("server"))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(mcpConfig(servers), null, 2) + "\n")
  console.log(`config écrite : ${out} (${Object.keys(servers).join(", ")})`)
}

/** Un tour : `claude -p`, prompt sur stdin, flux stream-json recopié ligne à ligne dans le jsonl. */
function runTurn({ bin, args, prompt, cwd, out, timeoutMs }) {
  return new Promise((resolveTurn) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    // Décodage UTF-8 en flux : un caractère accentué coupé entre deux morceaux resterait sinon illisible.
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    let buffer = ""
    let sessionId
    let servers = []
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.on("data", (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line === "") continue
        out.write(line + "\n")
        try {
          const event = JSON.parse(line)
          sessionId = event.session_id ?? sessionId
          if (event.type === "system" && event.subtype === "init") servers = event.mcp_servers ?? []
        } catch {
          // ligne non JSON : gardée telle quelle dans le jsonl, l'analyseur la marque « unparsed »
        }
      }
    })
    child.stderr.on("data", (chunk) => (stderr += chunk))
    // Sans ces écouteurs, un CLI introuvable ou sorti avant de lire stdin (EPIPE) arrête toute la campagne.
    child.on("error", (error) => (stderr += `\n${error.message}`))
    child.stdin.on("error", (error) => (stderr += `\n${error.message}`))
    child.on("close", (code) => {
      clearTimeout(timer)
      if (buffer.trim() !== "") out.write(buffer.trim() + "\n")
      resolveTurn({ code: code ?? -1, timedOut, sessionId, servers, stderr: stderr.slice(-2000) })
    })
    child.stdin.end(prompt)
  })
}

async function run() {
  const planPath = positional[0]
  if (!planPath) fail("usage : pnpm bench:cc run <plan.json> [--only D1,I3] [--models sonnet] [--out <dossier>] [--dry-run]")
  const plan = JSON.parse(readFileSync(planPath, "utf8"))
  const golden = plan.goldenQueries ? promptsFromGoldenQueries(readFileSync(plan.goldenQueries, "utf8")) : {}
  const runs = expandPlan(plan, golden, {
    only: option("only")?.split(","),
    models: option("models")?.split(","),
  })
  const mcpConfigPath = resolve(plan.mcpConfig)
  const bin = claudeBin()
  const dryRun = rest.includes("--dry-run")
  if (!dryRun) {
    if (!existsSync(mcpConfigPath)) fail(`config MCP absente : ${mcpConfigPath} (pnpm bench:cc config …)`)
    const version = checkCliVersion(spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ?? "")
    if (!version.ok) fail(version.message)
    console.log(version.message)
  }
  const outDir = resolve(option("out") ?? join(".bench/cc", `${plan.name}-${stamp()}`))
  if (!dryRun) mkdirSync(outDir, { recursive: true })
  for (const [index, item] of runs.entries()) {
    console.log(`[${index + 1}/${runs.length}] ${item.id}`)
    if (dryRun) {
      for (const [t, turn] of item.turns.entries()) {
        if (turn.before) console.log(`  avant le tour ${t + 1} : ${turn.before}`)
        const args = claudeArgs({ ...plan, model: item.model, mcpConfigPath, extraArgs: item.extraArgs, resume: t > 0 ? "<session_id>" : undefined })
        console.log(`  tour ${t + 1} : ${formatCommand(bin, args)}  < ${JSON.stringify(turn.text)}`)
      }
      continue
    }
    const cwd = mkdtempSync(join(tmpdir(), "cc-run-")) // dossier vide : aucun CLAUDE.md de projet
    const out = createWriteStream(join(outDir, `${item.id}.jsonl`))
    out.write(JSON.stringify({ type: "harness_run", run: item.id, prompt: item.prompt, model: item.model, trial: item.trial, turns: item.turns.length, plan: plan.name, permission: plan.permission, started_at: new Date().toISOString() }) + "\n")
    let sessionId
    for (const [t, turn] of item.turns.entries()) {
      let beforeExit
      if (turn.before) beforeExit = spawnSync(turn.before, { shell: true, stdio: "inherit" }).status
      if (turn.before && beforeExit !== 0) {
        // Jouer le tour quand même donnerait une mesure fausse marquée valide (D4 sans remise à zéro, M5 sans bump).
        out.write(JSON.stringify({ type: "harness_turn", turn: t + 1, text: turn.text, before: turn.before, before_exit: beforeExit, started_at: new Date().toISOString() }) + "\n")
        console.warn(`  ⚠ « ${turn.before} » a échoué (code ${beforeExit}) : run arrêté`)
        break
      }
      const args = claudeArgs({ ...plan, model: item.model, mcpConfigPath, extraArgs: item.extraArgs, resume: t > 0 ? sessionId : undefined })
      out.write(JSON.stringify({ type: "harness_turn", turn: t + 1, text: turn.text, before: turn.before, before_exit: beforeExit, command: formatCommand(bin, args), started_at: new Date().toISOString() }) + "\n")
      const result = await runTurn({ bin, args, prompt: turn.text, cwd, out, timeoutMs: plan.timeoutMs ?? 600_000 })
      sessionId = result.sessionId ?? sessionId
      const down = result.servers.filter((server) => server.status !== "connected").map((server) => `${server.name}:${server.status}`)
      if (down.length > 0) console.warn(`  ⚠ serveur non connecté (${down.join(", ")}) : run invalide, voir docs/bench/harnais.md § Pièges`)
      out.write(JSON.stringify({ type: "harness_turn_end", turn: t + 1, exit_code: result.code, timed_out: result.timedOut, stderr: result.stderr, ended_at: new Date().toISOString() }) + "\n")
      if (result.code !== 0 || !sessionId) break // un tour suivant sans session reprendrait à vide
    }
    await new Promise((done) => out.end(done))
    rmSync(cwd, { recursive: true, force: true })
  }
  if (!dryRun) console.log(`runs écrits dans ${outDir}\nanalyse : pnpm bench:cc analyze ${outDir}`)
}

function analyze() {
  const target = positional[0]
  if (!target) fail("usage : pnpm bench:cc analyze <dossier de runs> [--write <regex>] [--match <regex>]")
  const files = target.endsWith(".jsonl") ? [target] : readdirSync(target).filter((file) => file.endsWith(".jsonl")).map((file) => join(target, file))
  const write = option("write")
  const match = option("match")
  const rows = files.sort().map((file) => {
    const row = analyzeRun(readFileSync(file, "utf8").split("\n"), {
      ...(write ? { writePattern: new RegExp(write) } : {}),
      ...(match ? { match: new RegExp(match) } : {}),
    })
    return { ...row, run: row.run || basename(file, ".jsonl") }
  })
  const markdown = toMarkdown(rows)
  console.log(markdown)
  if (!target.endsWith(".jsonl")) {
    writeFileSync(join(target, "analysis.md"), markdown + "\n")
    writeFileSync(join(target, "analysis.csv"), toCsv(rows))
    console.log(`\nécrits : ${join(target, "analysis.md")}, ${join(target, "analysis.csv")}`)
  }
}

if (command === "config") config()
else if (command === "run") await run()
else if (command === "analyze") analyze()
else fail("usage : pnpm bench:cc config|run|analyze … (voir docs/bench/harnais.md)")
