"use client"

// Formulaire de /login (E03-S03) : seul morceau client de la page. Sans lui, pas d'état pending (le bouton
// resterait actif pendant l'appel) ni d'erreur affichée sous le formulaire sans recharger la page.
import { useState, useTransition, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { login } from "@/lib/actions/auth"

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // onSubmit plutôt qu'une action de formulaire : React viderait les champs après un refus.
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      // Connexion réussie : l'action redirige, elle ne rend rien.
      if (result?.error !== undefined) setError(result.error)
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <CardContent className="space-y-4">
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="nom@exemple.com"
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
      </CardContent>
      <CardFooter>
        <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
          {pending && <Spinner size="sm" className="text-primary-foreground" aria-hidden />}
          Se connecter
        </Button>
      </CardFooter>
    </form>
  )
}
