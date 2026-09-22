#!/usr/bin/env node
// Smoke test MCP de bout en bout contre un serveur DÉJÀ démarré (`pnpm start` ou `pnpm dev`,
// ou une URL de prod) : initialize + tools/list + tools/call get_status. Gère les réponses SSE.
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
  if (init.status !== 200) throw new Error("initialize KO")
  if (init.body?.result?.serverInfo?.name !== "mcp-bench") throw new Error("serverInfo.name KO")

  const list = await rpc("tools/list", {}, 2)
  const tools = list.body?.result?.tools?.map((t) => t.name) ?? []
  console.log(`tools/list  → HTTP ${list.status} | ${tools.length} tools: ${tools.join(", ")}`)
  if (!tools.includes("get_status")) throw new Error("tool get_status absent")

  const status = await rpc("tools/call", { name: "get_status", arguments: {} }, 3)
  const content = status.body?.result?.content?.[0]?.text ?? JSON.stringify(status.body?.error)
  console.log(`get_status  → HTTP ${status.status} | ${content}`)
  if (status.status !== 200) throw new Error("get_status KO (HTTP)")
  // Un tool en erreur répond HTTP 200 avec isError — sinon l'échec passe inaperçu.
  if (status.body?.result?.isError) throw new Error(`get_status isError : ${content}`)
  if (!/status/.test(content ?? "")) throw new Error("get_status KO (contenu)")

  console.log("\n✅ SMOKE TEST MCP COMPLET : OK")
}

main().catch((e) => {
  console.error("✗", e.message)
  process.exitCode = 1
})
