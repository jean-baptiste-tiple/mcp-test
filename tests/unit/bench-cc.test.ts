// @vitest-environment node
// Harnais des campagnes Claude Code : l'analyseur sur un run fictif versionné, et les drapeaux qui
// encodent les pièges mesurés (sans eux, une campagne se rejoue silencieusement dans de mauvaises conditions).
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  analyzeRun,
  checkCliVersion,
  claudeArgs,
  expandPlan,
  mcpConfig,
  parseServerSpecs,
  promptsFromGoldenQueries,
  resolveClaudeBin,
  toCsv,
  toMarkdown,
} from "../../scripts/lib/cc-harness.mjs"
import type { Plan } from "../../scripts/lib/cc-harness.mjs"

const fixture = readFileSync(fileURLToPath(new URL("./fixtures/cc-run.example.jsonl", import.meta.url)), "utf8").split("\n")

describe("analyzeRun", () => {
  it("rend la ligne attendue d'un run à deux tours", () => {
    const row = analyzeRun(fixture, { match: /ton assistant Acme/ })
    expect(row).toMatchObject({
      run: "D1__claude-sonnet-5__t1",
      model: "claude-sonnet-5",
      prompt: "D1",
      trial: 1,
      cli: "2.1.280",
      servers: "acme:connected delta:connected",
      turns: 2,
      calls: 4,
      first_call: "acme_context",
      sequence:
        "acme_context → acme_call sellsy.list_estimates → acme_call mail.create_draft ✗ ‖ acme_call mail.send_draft !",
      tool_errors: 1,
      before_first_write: 2,
      confirms: 1,
      denials: 1,
      duration_s: 6.5,
      tokens_in: 15,
      tokens_out: 150,
      cache_read: 3000,
      cache_write: 500,
      cost_usd: 0.015,
      final_match: true,
      error: false,
    })
  })

  it("marque en erreur un run sans résultat et sans appel", () => {
    const row = analyzeRun(['{"type":"harness_turn_end","turn":1,"exit_code":1}'])
    expect(row).toMatchObject({ calls: 0, sequence: "aucun appel", before_first_write: "", error: true })
  })

  it("invalide un run dont un serveur MCP n'est pas connecté", () => {
    const failed = fixture.map((line) => line.replace('{"name":"delta","status":"connected"}', '{"name":"delta","status":"failed"}'))
    expect(analyzeRun(failed)).toMatchObject({ servers: "acme:connected delta:failed", error: true })
  })

  it("invalide un run dont la commande before a échoué ou dont un tour a expiré", () => {
    const withBefore = ['{"type":"harness_turn","turn":1,"before":"pnpm proto:set acme rules bump","before_exit":1}']
    expect(analyzeRun(withBefore).error).toBe(true)
    const timedOut = fixture.map((line) => line.replace('"turn":2,"exit_code":0,', '"turn":2,"exit_code":-1,"timed_out":true,'))
    expect(analyzeRun(timedOut).error).toBe(true)
    const interrupted = fixture.filter((line) => !line.includes('"turn":2'))
    expect(analyzeRun(interrupted).error).toBe(true)
  })

  it("accepte un autre motif d'écriture", () => {
    expect(analyzeRun(fixture, { writePattern: /send_draft/ }).before_first_write).toBe(3)
  })
})

describe("claudeArgs", () => {
  const base = { model: "claude-sonnet-5", mcpConfigPath: "/tmp/mcp.json", allowedTools: ["mcp__acme"] }

  it("coupe les outils internes et les autres configs MCP, en bypass", () => {
    const args = claudeArgs({ ...base, permission: "bypass" })
    expect(args.slice(0, 8)).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--model", "claude-sonnet-5", "--tools", ""])
    expect(args).toContain("--strict-mcp-config")
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", "project", "--permission-mode", "bypassPermissions"]))
    expect(JSON.parse(args[args.indexOf("--settings") + 1])).toEqual({ claudeMdExcludes: ["**/CLAUDE.md", "**/CLAUDE.local.md", "**/.claude/rules/**"] })
    expect(args).not.toContain("--allowedTools") // bypass autorise déjà tout : la liste serait trompeuse
  })

  it("laisse le mode par défaut en allowlist et reprend la session au tour 2", () => {
    const args = claudeArgs({ ...base, permission: "allowlist", resume: "abc", extraArgs: ["--append-system-prompt", "x"] })
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", "project", "--permission-mode", "manual", "--allowedTools", "mcp__acme"]))
    expect(args).not.toContain("bypassPermissions")
    expect(args.slice(-4)).toEqual(["--resume", "abc", "--append-system-prompt", "x"])
  })
})

describe("plan", () => {
  const golden = promptsFromGoldenQueries("| # | Prompt | Attendu |\n|---|---|---|\n| D1 | Relance les devis. | x |\n| I3 | Prix ? | y |")
  const plan: Plan = {
    name: "t",
    mcpConfig: "mcp.json",
    models: ["claude-sonnet-5", "claude-opus-5-5"],
    trials: 2,
    permission: "bypass",
    prompts: [{ id: "D1", turns: ["@D1", { text: "Oui.", before: "pnpm proto:set acme rules bump" }] }, { id: "I3" }],
  }

  it("lit les golden queries et développe prompts × modèles × essais", () => {
    expect(golden).toEqual({ D1: "Relance les devis.", I3: "Prix ?" })
    const runs = expandPlan(plan, golden)
    expect(runs).toHaveLength(8)
    expect(runs[0]).toMatchObject({ id: "D1__claude-sonnet-5__t1", turns: [{ text: "Relance les devis." }, { text: "Oui.", before: "pnpm proto:set acme rules bump" }] })
    expect(expandPlan(plan, golden, { only: ["I3"], models: ["sonnet"] }).map((run) => run.id)).toEqual(["I3__claude-sonnet-5__t1", "I3__claude-sonnet-5__t2"])
  })

  it("refuse une golden query absente et une allowlist vide", () => {
    expect(() => expandPlan({ ...plan, prompts: [{ id: "Z9" }] }, golden)).toThrow("Z9 introuvable")
    expect(() => expandPlan({ ...plan, permission: "allowlist" }, golden)).toThrow("allowedTools requis")
    expect(() => expandPlan(plan, golden, { only: ["Z9"] })).toThrow("absent(s) du plan : Z9")
    expect(() => expandPlan(plan, golden, { models: ["sonet"] })).toThrow("aucun run")
  })
})

describe("outillage", () => {
  it("exige un CLI assez récent", () => {
    expect(checkCliVersion("2.1.279 (Claude Code)").ok).toBe(false)
    expect(checkCliVersion("2.1.280 (Claude Code)").ok).toBe(true)
    expect(checkCliVersion("3.0.0").ok).toBe(true)
  })

  it("trouve claude.exe derrière le raccourci npm de Windows", () => {
    const exe = "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"
    const files = new Set(["C:\\npm\\claude.cmd", exe])
    expect(resolveClaudeBin({ platform: "win32", pathEntries: ["C:\\npm"], exists: (path) => files.has(path) })).toBe(exe)
    expect(resolveClaudeBin({ platform: "linux" })).toBe("claude")
  })

  it("écrit une config MCP sans secret", () => {
    const servers = parseServerSpecs(["acme=https://exemple.test/mcp"])
    expect(mcpConfig(servers)).toEqual({ mcpServers: { acme: { type: "http", url: "https://exemple.test/mcp" } } })
    expect(() => parseServerSpecs(["acme"])).toThrow("nom=https")
  })

  it("échappe les cellules en markdown et en CSV", () => {
    const row = analyzeRun(fixture)
    expect(toMarkdown([row])).toContain("acme_call mail.send_draft !")
    expect(toCsv([{ ...row, sequence: 'a, "b"' }])).toContain('"a, ""b"""')
  })
})
