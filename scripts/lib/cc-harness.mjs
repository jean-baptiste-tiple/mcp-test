// Harnais des campagnes Claude Code (claude -p) : logique pure, sans E/S, pour qu'elle se teste.
// Sans lui, chaque campagne réécrivait ses scripts dans un scratchpad (E01, E03-S05, E04-S06 : perdus)
// et un tiers ne pouvait pas rejouer une mesure. Le CLI est scripts/bench-cc.mjs, la doc docs/bench/harnais.md.

/** Version minimale du CLI : 2.1.280 est la première qui accepte Opus 5.5 (constaté en E04-S06). */
export const MIN_CLI_VERSION = "2.1.280"

/** Appels qui écrivent ou envoient sur le serveur proto ; surchargeable par `analyze --write <regex>`. */
export const DEFAULT_WRITE_PATTERN =
  /_write\b|\b(mail\.create_draft|mail\.send_draft|slack\.post_message|table\.write|table\.claim|table\.release)\b/

/** « 2.1.280 (Claude Code) » → [2, 1, 280] ; null si illisible. */
export function parseCliVersion(output) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(output))
  return match ? match.slice(1).map(Number) : null
}

/** Refuse un CLI trop ancien : sans ce contrôle, `--model claude-opus-5-5` échoue run par run. */
export function checkCliVersion(output, min = MIN_CLI_VERSION) {
  const found = parseCliVersion(output)
  const wanted = parseCliVersion(min)
  if (!found) return { ok: false, message: `version du CLI illisible : « ${String(output).trim()} »` }
  for (let i = 0; i < 3; i++) {
    if (found[i] > wanted[i]) break
    if (found[i] < wanted[i]) return { ok: false, message: `CLI ${found.join(".")} : ${min} ou plus récent requis (claude update)` }
  }
  return { ok: true, message: `CLI ${found.join(".")}` }
}

/**
 * Binaire à lancer. Sous Windows, `claude` est un raccourci .cmd que Node ne lance pas sans shell
 * (et un shell casserait les prompts accentués ou entre guillemets) : on cherche claude.exe.
 * `exists` et `pathEntries` sont injectés pour les tests.
 */
export function resolveClaudeBin({ platform = "linux", pathEntries = [], exists = () => false } = {}) {
  if (platform !== "win32") return "claude"
  for (const dir of pathEntries) {
    const direct = `${dir}\\claude.exe`
    if (exists(direct)) return direct
    const npmShim = `${dir}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`
    if (exists(`${dir}\\claude.cmd`) && exists(npmShim)) return npmShim
  }
  return "claude.exe"
}

/** ["acme=https://…"] → { acme: "https://…" }. */
export function parseServerSpecs(specs) {
  const servers = {}
  for (const spec of specs) {
    const separator = spec.indexOf("=")
    const name = spec.slice(0, separator)
    const url = spec.slice(separator + 1)
    if (separator < 1 || !/^[a-z0-9_-]+$/i.test(name) || !/^https?:\/\//.test(url)) {
      throw new Error(`serveur invalide « ${spec} » : attendu nom=https://…`)
    }
    servers[name] = url
  }
  if (Object.keys(servers).length === 0) throw new Error("au moins un --server nom=URL")
  return servers
}

/** Config `--mcp-config` : des URL seulement, aucun secret (un serveur OAuth se connecte par `claude mcp login`). */
export function mcpConfig(servers) {
  return { mcpServers: Object.fromEntries(Object.entries(servers).map(([name, url]) => [name, { type: "http", url }])) }
}

/** Prompts d'un fichier de golden queries : chaque ligne de tableau `| ID | prompt | … |`. */
export function promptsFromGoldenQueries(markdown) {
  const prompts = {}
  for (const line of String(markdown).split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim())
    if (cells.length < 4 || !/^[A-Z]\d+$/.test(cells[1])) continue
    prompts[cells[1]] = cells[2]
  }
  return prompts
}

function resolveTurn(turn, golden, promptId) {
  const item = typeof turn === "string" ? { text: turn } : turn
  if (!item || typeof item.text !== "string" || item.text === "") throw new Error(`${promptId} : tour sans texte`)
  let text = item.text
  if (text.startsWith("@")) {
    const ref = text.slice(1)
    if (!(ref in golden)) throw new Error(`${promptId} : golden query ${ref} introuvable`)
    text = golden[ref]
  }
  return item.before ? { text, before: String(item.before) } : { text }
}

/**
 * Plan → liste des runs (prompts × modèles × essais), dans l'ordre d'exécution. Un prompt sans
 * `turns` est la golden query de même id ; `@ID` dans un tour la cite. Erreur claire sinon.
 */
export function expandPlan(plan, golden = {}, { only, models } = {}) {
  if (!plan || !Array.isArray(plan.prompts) || !Array.isArray(plan.models) || plan.models.length === 0) {
    throw new Error("plan invalide : prompts[] et models[] requis")
  }
  if (!["bypass", "allowlist"].includes(plan.permission)) throw new Error('plan.permission : "bypass" ou "allowlist"')
  if (plan.permission === "allowlist" && !(plan.allowedTools?.length > 0)) {
    throw new Error("plan.permission allowlist : allowedTools requis, sinon tout appel MCP est refusé")
  }
  const trials = Number.isInteger(plan.trials) && plan.trials > 0 ? plan.trials : 1
  const unknown = (only ?? []).filter((id) => !plan.prompts.some((prompt) => prompt?.id === id))
  if (unknown.length > 0) throw new Error(`--only : prompt(s) absent(s) du plan : ${unknown.join(", ")}`)
  const ids = new Set()
  const runs = []
  for (const prompt of plan.prompts) {
    if (!prompt?.id || ids.has(prompt.id)) throw new Error(`prompt sans id ou id en double : ${prompt?.id}`)
    ids.add(prompt.id)
    if (only && !only.includes(prompt.id)) continue
    const turns = (prompt.turns ?? [`@${prompt.id}`]).map((turn) => resolveTurn(turn, golden, prompt.id))
    for (const model of plan.models) {
      if (models && !models.some((wanted) => model.includes(wanted))) continue
      for (let trial = 1; trial <= trials; trial++) {
        runs.push({
          id: `${prompt.id}__${model}__t${trial}`,
          prompt: prompt.id,
          model,
          trial,
          turns,
          extraArgs: prompt.extraArgs ?? [],
        })
      }
    }
  }
  if (runs.length === 0) throw new Error("aucun run : vérifier --only et --models")
  return runs
}

/**
 * Arguments de `claude` pour un tour. Le prompt passe par stdin. Les pièges y sont encodés :
 * `--tools ""` (sinon le modèle se rabat sur ses outils internes : Fable a tenté Bash),
 * `--strict-mcp-config` (sinon une session connectée à claude.ai charge aussi les connecteurs
 * claude.ai de l'utilisateur : deux clients OAuth pour un même serveur), `--verbose` (exigé par
 * stream-json en -p), `--setting-sources project` (sinon `~/.claude/settings.json` s'applique : avec
 * `defaultMode: "auto"`, le classifieur approuvait un outil hors allowlist ; hooks et plugins
 * personnels aussi) et `claudeMdExcludes` (sinon le CLAUDE.md personnel entre dans chaque run, même
 * avec `--setting-sources project` : mesuré le 2026-10-15). `bypass` supprime toute demande
 * d'approbation ; `allowlist` force le mode manuel (affiché `default` dans l'init : celui d'un poste
 * neuf) et n'autorise que `allowedTools`.
 */
export const ISOLATION_SETTINGS = JSON.stringify({ claudeMdExcludes: ["**/CLAUDE.md", "**/CLAUDE.local.md", "**/.claude/rules/**"] })

export function claudeArgs({ model, mcpConfigPath, permission, allowedTools = [], extraArgs = [], resume }) {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--model", model, "--tools", ""]
  args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config")
  args.push("--setting-sources", "project", "--settings", ISOLATION_SETTINGS)
  args.push("--permission-mode", permission === "bypass" ? "bypassPermissions" : "manual")
  if (permission === "allowlist") args.push("--allowedTools", ...allowedTools)
  if (resume) args.push("--resume", resume)
  args.push(...extraArgs)
  return args
}

/** Commande lisible, pour la ligne d'en-tête du jsonl (le prompt est à part : il passe par stdin). */
export function formatCommand(bin, args) {
  return [bin, ...args].map((part) => (part === "" || /[\s"']/.test(part) ? JSON.stringify(part) : part)).join(" ")
}

function parseLines(lines) {
  const events = []
  for (const raw of lines) {
    const line = typeof raw === "string" ? raw.trim() : ""
    if (line === "") continue
    try {
      events.push(JSON.parse(line))
    } catch {
      events.push({ type: "unparsed", line: line.slice(0, 200) })
    }
  }
  return events
}

function stepLabel(name, input) {
  const tool = String(name).replace(/^mcp__.+?__/, "")
  const target = input?.function ?? input?.path ?? input?.query
  return target ? `${tool} ${target}` : tool
}

const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0)

/**
 * Un run (lignes du jsonl, tous tours compris) → une ligne de grille. Le récit du modèle n'est
 * jamais une preuve seul : ces chiffres se recoupent avec le journal du serveur (protocol.md R1–R6).
 */
export function analyzeRun(lines, { writePattern = DEFAULT_WRITE_PATTERN, match } = {}) {
  const events = parseLines(lines)
  const header = events.find((event) => event.type === "harness_run") ?? {}
  // Un init par tour : avec --resume, le CLI reconnecte les serveurs, et un tour 2 peut partir sans eux.
  const inits = events.filter((event) => event.type === "system" && event.subtype === "init")
  const init = inits[0] ?? {}
  const turnStarts = events.filter((event) => event.type === "harness_turn")
  const results = events.filter((event) => event.type === "result")
  const turnEnds = events.filter((event) => event.type === "harness_turn_end")
  const errorsById = new Map()
  for (const event of events) {
    if (event.type !== "user") continue
    for (const block of event.message?.content ?? []) {
      if (block.type === "tool_result") errorsById.set(block.tool_use_id, block.is_error === true)
    }
  }
  const steps = []
  let turn = 0
  for (const event of events) {
    if (event.type === "harness_turn") turn = event.turn
    if (event.type !== "assistant") continue
    for (const block of event.message?.content ?? []) {
      if (block.type !== "tool_use") continue
      const input = block.input ?? {}
      steps.push({
        turn,
        label: stepLabel(block.name, input),
        confirm: input.confirm === true || input.arguments?.confirm === true,
        error: errorsById.get(block.id) === true,
      })
    }
  }
  const firstWrite = steps.findIndex((step) => writePattern.test(step.label))
  const text = (step) => `${step.label}${step.confirm ? " !" : ""}${step.error ? " ✗" : ""}`
  const turnsSeen = [...new Set(steps.map((step) => step.turn))]
  const sequence = turnsSeen.map((t) => steps.filter((step) => step.turn === t).map(text).join(" → ")).join(" ‖ ")
  const finalText = results.at(-1)?.result ?? ""
  const serversOf = (event) => (event.mcp_servers ?? []).map((server) => `${server.name}:${server.status}`).join(" ")
  const servers = [...new Set(inits.map(serversOf))].join(" ‖ ")
  return {
    run: header.run ?? "",
    model: header.model ?? init.model ?? "",
    prompt: header.prompt ?? "",
    trial: header.trial ?? "",
    cli: init.claude_code_version ?? "",
    servers,
    turns: Math.max(results.length, turnEnds.length),
    calls: steps.length,
    first_call: steps[0]?.label ?? "",
    sequence: sequence || "aucun appel",
    tool_errors: steps.filter((step) => step.error).length,
    before_first_write: firstWrite === -1 ? "" : firstWrite,
    confirms: steps.filter((step) => step.confirm).length,
    denials: sum(results.map((result) => result.permission_denials?.length)),
    duration_s: Math.round(sum(results.map((result) => result.duration_ms)) / 100) / 10,
    tokens_in: sum(results.map((result) => result.usage?.input_tokens)),
    tokens_out: sum(results.map((result) => result.usage?.output_tokens)),
    cache_read: sum(results.map((result) => result.usage?.cache_read_input_tokens)),
    cache_write: sum(results.map((result) => result.usage?.cache_creation_input_tokens)),
    cost_usd: Math.round(sum(results.map((result) => result.total_cost_usd)) * 10000) / 10000,
    final_match: match ? match.test(finalText) : "",
    // Run inexploitable : un serveur non connecté (le modèle répond sans nos outils), une commande
    // `before` en échec (D4 sans remise à zéro, M5 sans bump : mesure fausse), un tour coupé ou manquant
    // (campagne interrompue : un D1 sorti après un tour sur trois).
    error:
      results.some((result) => result.is_error) ||
      turnEnds.some((end) => end.exit_code !== 0 || end.timed_out === true) ||
      turnStarts.some((start) => start.before_exit !== undefined && start.before_exit !== 0) ||
      (Number.isInteger(header.turns) && turnEnds.length < header.turns) ||
      results.length === 0 ||
      inits.some((event) => (event.mcp_servers ?? []).some((server) => server.status !== "connected")),
  }
}

export const COLUMNS = [
  "run", "model", "prompt", "trial", "cli", "servers", "turns", "calls", "first_call", "sequence",
  "tool_errors", "before_first_write", "confirms", "denials", "duration_s", "tokens_in", "tokens_out",
  "cache_read", "cache_write", "cost_usd", "final_match", "error",
]

/** Grille markdown : colonnes de lecture seulement (le CSV garde tout). */
export function toMarkdown(rows) {
  const columns = ["prompt", "model", "trial", "calls", "sequence", "tool_errors", "before_first_write", "confirms", "denials", "duration_s", "tokens_out", "final_match", "error"]
  const cell = (value) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
  return [
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(" | ")} |`),
  ].join("\n")
}

export function toCsv(rows) {
  const cell = (value) => {
    const text = String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [COLUMNS.join(","), ...rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(","))].join("\n") + "\n"
}
