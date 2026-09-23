// Scopes OAuth en pilules, un par un, tels que Supabase les rend (E03-S03) : même rendu sur /oauth/consent
// (scopes demandés) et /auth-test/grants (scopes accordés). Sans lui, les deux pages dupliqueraient ce
// rendu. Casse d'origine conservée (`normal-case`) et doublons gardés : un scope est un identifiant, relevé
// tel que le host l'envoie pendant la campagne.
import { Badge } from "@/components/ui/badge"

export function ScopeList({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) return <span className="text-sm text-muted-foreground">Aucun scope</span>

  return (
    <ul className="flex flex-wrap gap-1.5">
      {scopes.map((scope, index) => (
        // Clé par position : un scope peut revenir deux fois, et la liste n'est jamais réordonnée.
        <li key={index}>
          <Badge variant="secondary" className="normal-case">
            {scope}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
