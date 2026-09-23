"use client"

// Boutons Autoriser / Refuser de /oauth/consent (E03-S03) : seul morceau client de la page. Sans lui, pas
// d'état pending (un double clic enverrait deux décisions) ni d'erreur affichée sans recharger la page.
import { useState, useTransition } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { approve, deny, type Decision } from "./actions"

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)

  function decide(decision: Decision) {
    setChoice(decision)
    setError(null)
    startTransition(async () => {
      const result = await (decision === "approve" ? approve : deny)(authorizationId)
      // Décision rendue : l'action redirige vers l'assistant, la promesse ne rend rien.
      if (result?.error !== undefined) setError(result.error)
    })
  }

  return (
    <div className="w-full space-y-4">
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => decide("deny")}
          disabled={pending}
          aria-busy={pending && choice === "deny"}
        >
          {pending && choice === "deny" && <Spinner size="sm" aria-hidden />}
          Refuser
        </Button>
        <Button type="button" onClick={() => decide("approve")} disabled={pending} aria-busy={pending && choice === "approve"}>
          {pending && choice === "approve" && <Spinner size="sm" className="text-primary-foreground" aria-hidden />}
          Autoriser
        </Button>
      </div>
    </div>
  )
}
