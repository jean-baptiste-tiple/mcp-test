// Mise en forme des résultats de tools — mcp-patterns §4 : TOUJOURS les deux formes.
// ⚠️ CONTRAT (retour agents) : le `content` texte est la SEULE voie fiable vers le
// modèle — certains hosts lui masquent `structuredContent`. Tout ce que le modèle doit
// lire ou exécuter va dans `text`.

interface ToolResultOptions {
  // Ce que le modèle LIT : résumé 2-4 lignes, ou consignes complètes pour un "prepare".
  text: string
  // Canal structuré (citable quand l'host l'expose) : ids + résumé + next_actions.
  structured: Record<string, unknown> & { next_actions?: string[] }
}

export function toToolResult({ text, structured }: ToolResultOptions) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
  }
}

// Erreur actionnable (§4) : une instruction de récupération pour l'agent, pas un stack trace.
export function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  }
}
