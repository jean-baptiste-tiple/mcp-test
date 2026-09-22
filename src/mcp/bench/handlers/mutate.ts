// Handler `mutate` : la seule ÉCRITURE du banc. Sans lui, changer un tool demande d'ouvrir
// Supabase Studio — donc de quitter la conversation, donc de perdre le tour où l'on mesure
// si l'host a rechargé sa liste (parcours 4.1).
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import {
  BenchMutateInput,
  describeMutateIssues,
  type BenchMutateInputType,
} from "@/lib/schemas/bench-mutate"
import { toToolResult, toolError } from "@/mcp/tool-result"

import { outcomeFor, type BenchToolContext } from "../context"
import type { BenchScenarioRow } from "../repository"
import type { BenchSnapshot } from "../snapshot"

const NEXT_STEP = "Now call bench_whoami and compare with your tool list."

/** Ce qu'une action a changé, ou l'erreur MCP qui remplace tout le résultat. */
type ActionOutcome = { ok: true; changed: string } | { ok: false; result: CallToolResult }

function failed(result: CallToolResult): ActionOutcome {
  return { ok: false, result }
}

function notFound(name: string, scenario: BenchScenarioRow): ActionOutcome {
  return failed(
    toolError(
      `Tool ${name} not found in scenario ${scenario.slug}. ` +
        `Call tools/list to see the current tools, or use create_tool.`
    )
  )
}

/** Applique l'effet propre à l'action sur le scénario actif. */
async function applyAction(
  input: BenchMutateInputType,
  scenario: BenchScenarioRow,
  ctx: BenchToolContext
): Promise<ActionOutcome> {
  const scenarioId = scenario.id
  // `superRefine` garantit `name` pour les quatre actions de tool (schéma Zod partagé).
  const name = input.name ?? ""
  const fields = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.input_schema !== undefined ? { inputSchema: input.input_schema } : {}),
  }

  switch (input.action) {
    case "create_tool": {
      const created = await ctx.repo.createTool({ scenarioId, name, ...fields })
      if (!created) {
        return failed(
          toolError(
            `Tool ${name} already exists in scenario ${scenario.slug}. ` +
              `Use update_tool to change it, or enable_tool if it is disabled.`
          )
        )
      }
      return {
        ok: true,
        changed: `created tool ${name} (handler echo, sort_order ${created.sort_order})`,
      }
    }

    case "update_tool": {
      const updated = await ctx.repo.updateTool({ scenarioId, name, ...fields })
      if (!updated) return notFound(name, scenario)
      return { ok: true, changed: `updated tool ${name} (version ${updated.version})` }
    }

    case "disable_tool":
    case "enable_tool": {
      const enabled = input.action === "enable_tool"
      const row = await ctx.repo.setToolEnabled(scenarioId, name, enabled)
      if (!row) return notFound(name, scenario)
      return { ok: true, changed: `${enabled ? "enabled" : "disabled"} tool ${name}` }
    }

    case "set_instructions": {
      const instructions = input.instructions ?? ""
      await ctx.repo.setInstructions(scenarioId, instructions)
      return { ok: true, changed: `replaced server instructions (${instructions.length} characters)` }
    }

    case "bump_version":
      return { ok: true, changed: "bumped server version only" }
  }
}

export async function mutateHandler(
  args: Record<string, unknown>,
  ctx: BenchToolContext,
  snapshot: BenchSnapshot
): Promise<CallToolResult> {
  // Les arguments viennent d'un modèle sur un endpoint public : Zod d'abord, toujours.
  const parsed = BenchMutateInput.safeParse(args)
  if (!parsed.success) return toolError(describeMutateIssues(parsed.error))

  const scenario = snapshot.scenario
  if (!scenario) return toolError("No active scenario. Activate one in the database first.")

  const action = await applyAction(parsed.data, scenario, ctx)
  if (!action.ok) return action.result

  // Toute action bump la version serveur : c'est le signal qu'un host peut comparer sans
  // relire la liste (architecture §6).
  const serverVersion = await ctx.repo.bumpServerVersion(scenario.id, scenario.server_version)

  const call = outcomeFor(ctx)
  try {
    // Notification ATTACHÉE à la requête courante : en stateless (ADR-001, `disableSse`) il
    // n'existe aucun flux SSE autonome, et le transport du SDK y abandonne silencieusement
    // toute notification — `sendToolListChanged()` renverrait donc « envoyé » sans que rien
    // ne parte. `relatedRequestId` l'écrit dans le flux de réponse de CE tools/call, la
    // seule voie que le host lit vraiment ici ; `list_changed_sent = true` veut alors dire
    // « écrite dans le flux ». Le push hors requête reste le sujet de E02.
    await ctx.server.server.notification(
      { method: "notifications/tools/list_changed" },
      { relatedRequestId: ctx.requestId }
    )
    call.listChangedSent = true
  } catch {
    // Pas de flux (client en JSON simple, requête déjà close) : c'est une mesure, jamais une
    // erreur rendue à l'agent.
    call.listChangedSent = false
  }

  return toToolResult({
    text: `${action.changed}\nserver_version ${scenario.server_version} → ${serverVersion}\n\n${NEXT_STEP}`,
    structured: {
      action: parsed.data.action,
      scenario: scenario.slug,
      changed: action.changed,
      server_version: serverVersion,
      list_changed_sent: call.listChangedSent ?? false,
      next_actions: ["bench_whoami"],
    },
  })
}
