"use client"

// Bouton Révoquer d'un client de /auth-test/grants (E03-S03) : seul morceau client de la page. Sans lui, pas
// d'état pending (un double clic révoquerait deux fois) ni d'erreur affichée sans recharger la page.
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { revoke } from "./actions"

export function RevokeButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onRevoke() {
    setError(null)
    startTransition(async () => {
      const result = await revoke(clientId)
      // Réussite : revalidatePath rafraîchit la liste, la ligne disparaît avec ce bouton.
      if (result.error !== undefined) setError(result.error)
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRevoke}
        disabled={pending}
        aria-busy={pending}
        aria-label={`Révoquer ${clientName}`}
      >
        {pending && <Spinner size="sm" aria-hidden />}
        Révoquer
      </Button>
      {error !== null && (
        <p role="alert" className="max-w-40 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
