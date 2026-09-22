#!/usr/bin/env node
// Smoke test MCP de bout en bout contre un serveur DÉJÀ démarré (`pnpm start` ou `pnpm dev`,
// ou une URL de prod) : initialize + tools/list + les 4 sondes + un aller-retour d'écriture
// (bench_mutate create_tool → tools/list → disable_tool). Gère les réponses SSE.
// Vérifie la chaîne complète base → snapshot → handlers : les tools servis viennent du
// scénario actif, pas du code.
// ⚠️ Écrit en base : le scénario ACTIF gagne un tool `bench_probe_smoke` (désactivé à la fin)
// et sa `server_version` est incrémentée deux fois. Idempotent : relançable tel quel.
// Usage : node scripts/smoke-mcp.mjs [url]   (défaut http://localhost:3000/api/mcp)

const URL_ARG = process.argv[2] ?? "http://localhost:3000/api/mcp"

/** Les 4 sondes de la migration `probes` : c'est la surface minimale d'un banc utilisable. */
const PROBES = ["bench_whoami", "bench_echo", "bench_mutate", "bench_readme"]

/** Tool jetable créé puis désactivé par le smoke — jamais un nom de sonde. */
const PROBE_TOOL = "bench_probe_smoke"

// Un flux SSE porte PLUSIEURS messages : le serveur peut écrire des notifications
// (tools/list_changed) avant la réponse. Prendre la première ligne `data:` renverrait la
// notification à la place du résultat.
function parseMessages(text) {
  const dataLines = text.split("\n").filter((l) => l.startsWith("data:"))
  if (dataLines.length === 0) return [JSON.parse(text)]
  return dataLines.map((l) => JSON.parse(l.slice(5)))
}

async function rpc(method, params, id) {
  const res = await fetch(URL_ARG, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, id, params }),
  })
  const text = await res.text()
  const messages = text ? parseMessages(text) : []

  return {
    status: res.status,
    body: messages.find((m) => m.id === id) ?? null,
    notifications: messages.filter((m) => m.id === undefined).map((m) => m.method),
    // Rang des messages : une notification écrite APRÈS le résultat arriverait trop tard,
    // l'host ayant déjà refermé le flux de cette requête.
    resultIndex: messages.findIndex((m) => m.id === id),
    notificationIndex: (method) =>
      messages.findIndex((m) => m.id === undefined && m.method === method),
  }
}

async function listTools(id) {
  const list = await rpc("tools/list", {}, id)
  if (list.status !== 200) throw new Error(`tools/list KO (HTTP ${list.status})`)
  return list.body?.result?.tools?.map((t) => t.name) ?? []
}

/** Un tool en erreur répond HTTP 200 avec isError — sinon l'échec passe inaperçu. */
async function callTool(name, args, id, { allowError = false } = {}) {
  const res = await rpc("tools/call", { name, arguments: args }, id)
  const text = res.body?.result?.content?.[0]?.text ?? JSON.stringify(res.body?.error)
  if (res.status !== 200) throw new Error(`${name} KO (HTTP ${res.status}) : ${text}`)
  if (res.body?.result?.isError && !allowError) throw new Error(`${name} isError : ${text}`)
  return { text, notifications: res.notifications, res }
}

async function main() {
  console.log(`cible : ${URL_ARG}`)

  const init = await rpc(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smoke", version: "1.0" },
    },
    1
  )
  console.log(
    `initialize → HTTP ${init.status} | serverInfo:`,
    JSON.stringify(init.body?.result?.serverInfo ?? init.body?.error ?? init.body).slice(0, 200)
  )
  console.log(`instructions: ${JSON.stringify(init.body?.result?.instructions ?? null).slice(0, 200)}`)
  if (init.status !== 200) throw new Error("initialize KO")
  if (init.body?.result?.serverInfo?.name !== "mcp-bench") throw new Error("serverInfo.name KO")
  // `title` n'est pas typé par mcp-handler : seul le smoke garantit qu'il traverse encore
  // la chaîne scénario → serverInfo (S04 en fait une variable mesurée).
  if (init.body?.result?.serverInfo?.title !== "MCP Bench") throw new Error("serverInfo.title KO")
  // version 0.0.0 = snapshot vide : la base n'a aucun scénario actif (architecture §6).
  if (init.body?.result?.serverInfo?.version === "0.0.0") {
    throw new Error("aucun scénario actif en base (serverInfo.version = 0.0.0)")
  }

  const tools = await listTools(2)
  console.log(`tools/list  → ${tools.length} tools: ${tools.join(", ")}`)
  for (const probe of PROBES) {
    if (!tools.includes(probe)) throw new Error(`tool ${probe} absent`)
  }

  const whoami = await callTool("bench_whoami", { note: "smoke/script" }, 3)
  console.log(`bench_whoami → ${whoami.text.replace(/\s+/g, " ").slice(0, 180)}…`)
  // Le texte (seule voie fiable vers le modèle) doit porter la liste `name@version`.
  if (!whoami.text.includes("bench_echo@")) throw new Error("bench_whoami sans bench_echo@<version>")
  if (!whoami.text.includes("smoke/script")) throw new Error("bench_whoami ne renvoie pas la note")

  const echo = await callTool("bench_echo", { message: "hello" }, 4)
  console.log(`bench_echo  → ${echo.text}`)
  if (echo.text !== JSON.stringify({ message: "hello" })) {
    throw new Error(`bench_echo KO (écho non conforme) : ${echo.text}`)
  }

  // ── Aller-retour d'écriture : le banc doit être pilotable depuis la conversation ──
  // Idempotent : le tool peut rester en base (désactivé) d'un run précédent.
  let mutation = await callTool(
    "bench_mutate",
    { action: "create_tool", name: PROBE_TOOL, description: "Temporary tool created by the smoke test." },
    5,
    { allowError: true }
  )
  if (mutation.text.includes("already exists")) {
    console.log(`bench_mutate → ${PROBE_TOOL} déjà en base, réactivation`)
    mutation = await callTool("bench_mutate", { action: "enable_tool", name: PROBE_TOOL }, 6)
  } else {
    console.log(`bench_mutate → ${mutation.text.split("\n")[0]}`)
  }

  // La notification est écrite dans le flux de CET appel (stateless, ADR-001) : si elle n'y
  // est pas, `list_changed_sent` en base ne veut plus rien dire.
  const notifyIndex = mutation.res.notificationIndex("notifications/tools/list_changed")
  if (notifyIndex === -1) {
    throw new Error(`list_changed absente du flux : ${JSON.stringify(mutation.notifications)}`)
  }
  if (notifyIndex > mutation.res.resultIndex) {
    throw new Error("list_changed écrite APRÈS le résultat : le host aura déjà fermé le flux")
  }
  console.log("list_changed: reçu dans le flux")

  const afterCreate = await listTools(7)
  console.log(`tools/list  → ${afterCreate.length} tools`)
  if (!afterCreate.includes(PROBE_TOOL)) throw new Error(`${PROBE_TOOL} absent après create_tool`)

  await callTool("bench_mutate", { action: "disable_tool", name: PROBE_TOOL }, 8)
  const afterDisable = await listTools(9)
  if (afterDisable.includes(PROBE_TOOL)) throw new Error(`${PROBE_TOOL} encore listé après disable_tool`)
  console.log(`bench_mutate → ${PROBE_TOOL} désactivé, ${afterDisable.length} tools servis`)

  console.log("\n✅ SMOKE TEST MCP COMPLET : OK")
}

main().catch((e) => {
  console.error("✗", e.message)
  process.exitCode = 1
})
