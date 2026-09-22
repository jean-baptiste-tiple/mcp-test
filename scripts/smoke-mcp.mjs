#!/usr/bin/env node
// Smoke test MCP de bout en bout contre un serveur DÉJÀ démarré (`pnpm start` ou `pnpm dev`,
// ou une URL de prod) : initialize + tools/list + tools/call bench_echo. Gère les réponses SSE.
// Vérifie la chaîne complète base → snapshot → handlers : les tools servis viennent du
// scénario actif, pas du code.
// Usage : node scripts/smoke-mcp.mjs [url]   (défaut http://localhost:3000/api/mcp)

const URL_ARG = process.argv[2] ?? "http://localhost:3000/api/mcp"

function parseBody(text) {
  // Réponse JSON directe ou flux SSE (event:/data:)
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"))
  return JSON.parse(dataLine ? dataLine.slice(5) : text)
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
  return { status: res.status, body: text ? parseBody(text) : null }
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

  const list = await rpc("tools/list", {}, 2)
  const tools = list.body?.result?.tools?.map((t) => t.name) ?? []
  console.log(`tools/list  → HTTP ${list.status} | ${tools.length} tools: ${tools.join(", ")}`)
  if (!tools.includes("bench_echo")) throw new Error("tool bench_echo absent")

  const echo = await rpc("tools/call", { name: "bench_echo", arguments: { message: "hello" } }, 3)
  const content = echo.body?.result?.content?.[0]?.text ?? JSON.stringify(echo.body?.error)
  console.log(`bench_echo  → HTTP ${echo.status} | ${content}`)
  if (echo.status !== 200) throw new Error("bench_echo KO (HTTP)")
  // Un tool en erreur répond HTTP 200 avec isError — sinon l'échec passe inaperçu.
  if (echo.body?.result?.isError) throw new Error(`bench_echo isError : ${content}`)
  if (content !== JSON.stringify({ message: "hello" })) {
    throw new Error(`bench_echo KO (écho non conforme) : ${content}`)
  }

  console.log("\n✅ SMOKE TEST MCP COMPLET : OK")
}

main().catch((e) => {
  console.error("✗", e.message)
  process.exitCode = 1
})
