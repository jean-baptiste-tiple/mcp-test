// Page de connexion (E03-S03, FR-AUTH-08) : starter supabase-auth réduit à l'email et au mot de passe, sans
// inscription ni mot de passe oublié (les comptes viennent du seed). Sans elle, /oauth/consent n'a aucun
// moyen de poser une session : aucun host ne finit sa connexion OAuth. `redirect` ramène à la page
// demandée (relue par safeRedirect dans l'action).
import { AppLogo } from "@/components/logo"
import { Card, CardDescription, CardHeader } from "@/components/ui/card"
import { SITE_BRAND } from "@/lib/schemas/auth"

import { LoginForm } from "./login-form"

export const metadata = { title: "Connexion" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { redirect: target } = await searchParams

  return (
    <Card>
      <CardHeader className="items-center space-y-1 text-center">
        <AppLogo size={40} label={SITE_BRAND} className="mb-2" />
        <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
        <CardDescription>Compte du banc MCP : email et mot de passe.</CardDescription>
      </CardHeader>
      <LoginForm redirectTo={typeof target === "string" ? target : undefined} />
    </Card>
  )
}
