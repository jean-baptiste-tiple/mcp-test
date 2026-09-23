// Clients autorisés du compte connecté (E03-S03, FR-AUTH-08) : ce que le serveur OAuth de Supabase a
// enregistré, vu de l'utilisateur, avec la révocation (preuve 8) et la déconnexion (changement de compte
// pendant la campagne). Sans elle, aucun moyen de voir ni de retirer l'accès d'un assistant hors du tableau
// de bord Supabase.
import { redirect } from "next/navigation"
import { Plugs } from "@phosphor-icons/react/dist/ssr"
import type { OAuthGrant } from "@supabase/supabase-js"

import { EmptyState } from "@/components/empty-state"
import { ScopeList } from "@/components/scope-list"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { logout } from "@/lib/actions/auth"
import { GRANTS_PATH, loginPath, UNNAMED_CLIENT } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

import { LogoutButton } from "./logout-button"
import { RevokeButton } from "./revoke-button"

export const metadata = { title: "Clients autorisés" }

// Fuseau explicite : le serveur rend en UTC, la campagne se lit à l'heure de Paris.
const grantedAtFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
})

export default async function GrantsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(loginPath(GRANTS_PATH))

  const { data: grants, error } = await supabase.auth.oauth.listGrants()
  if (error) console.error("[grants] listGrants", error)

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">Clients autorisés</h1>
        <CardDescription>Assistants autorisés à agir au nom de {user.email}.</CardDescription>
      </CardHeader>
      <CardContent>
        <GrantList grants={error ? null : grants} />
      </CardContent>
      <CardFooter className="justify-end">
        <form action={logout}>
          <LogoutButton />
        </form>
      </CardFooter>
    </Card>
  )
}

function GrantList({ grants }: { grants: OAuthGrant[] | null }) {
  if (!grants) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Impossible de lire les clients autorisés. Rechargez la page.</AlertDescription>
      </Alert>
    )
  }

  if (grants.length === 0) {
    return (
      <EmptyState
        icon={<Plugs className="h-6 w-6" />}
        heading="Aucun client autorisé"
        description="Un assistant apparaît ici dès que vous l’autorisez sur la page de consentement."
        className="min-h-0 py-10"
      />
    )
  }

  return (
    <ul className="divide-y divide-border">
      {grants.map((grant) => {
        // Supabase omet le nom quand le client ne l'a pas déclaré (omitempty).
        const name = grant.client.name || UNNAMED_CLIENT
        return (
          <li key={grant.client.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 space-y-2">
              <div>
                <p className="break-words font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  Autorisé le <time dateTime={grant.granted_at}>{formatGrantedAt(grant.granted_at)}</time>
                </p>
              </div>
              <ScopeList scopes={grant.scopes ?? []} />
            </div>
            <RevokeButton clientId={grant.client.id} clientName={name} />
          </li>
        )
      })}
    </ul>
  )
}

function formatGrantedAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : grantedAtFormat.format(date)
}
