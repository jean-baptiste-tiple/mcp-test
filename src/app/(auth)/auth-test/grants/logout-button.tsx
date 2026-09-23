"use client"

// Bouton Déconnexion de /auth-test/grants (E03-S03) : seul morceau client du formulaire, qui reste dans la
// page serveur. Sans lui, le bouton reste actif pendant la déconnexion (un second clic relance signOut) et
// rien ne montre que la demande est partie.
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function LogoutButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending && <Spinner size="sm" aria-hidden />}
      Déconnexion
    </Button>
  )
}
