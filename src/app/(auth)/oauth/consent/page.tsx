// Page de consentement du serveur OAuth de Supabase (E03-S03, ADR-004 §7) : Supabase y envoie l'utilisateur
// (`<adresse de site>/oauth/consent?authorization_id=…`) avant de délivrer un code à un assistant. Sans
// elle, aucun host ne finit sa connexion OAuth. Elle montre ce que getAuthorizationDetails rend, sous la
// marque de l'organisation dont l'hôte est celui de la page, et journalise chaque affichage (`shown`) et
// chaque consentement déjà donné (`auto`).
import { redirect } from "next/navigation"
import { WarningCircle } from "@phosphor-icons/react/dist/ssr"

import { AppLogo } from "@/components/logo"
import { ScopeList } from "@/components/scope-list"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { resolveOrg } from "@/auth-test/orgs"
import { authorizationIdSchema, consentPath, loginPath, SITE_BRAND, UNNAMED_CLIENT } from "@/lib/schemas/auth"
import { getOauthTestClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

import { ConsentForm } from "./consent-form"
import { logConsent, requestInfo } from "./consent-journal"

export const metadata = { title: "Autoriser un assistant" }

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parsed = authorizationIdSchema.safeParse((await searchParams).authorization_id)
  if (!parsed.success) {
    return (
      <Notice
        title="Demande d’autorisation introuvable"
        description="Ce lien ne porte pas d’identifiant d’autorisation valide. Relancez la connexion depuis l’assistant."
      />
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(loginPath(consentPath(parsed.data)))

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(parsed.data)
  if (error || !data) {
    console.error("[consent] getAuthorizationDetails", error)
    return (
      <Notice
        title="Demande d’autorisation invalide ou expirée"
        description="Supabase ne reconnaît pas cette demande : expirée, ou déjà ouverte avec un autre compte. Relancez la connexion depuis l’assistant."
      />
    )
  }

  // Hôte et navigateur lus une fois : le journal et la marque les partagent.
  const request = await requestInfo()
  // Consentement déjà donné : Supabase rend directement l'adresse de retour de l'assistant.
  if (!("authorization_id" in data)) {
    await logConsent("auto", { user, request, redirectUrl: data.redirect_url })
    redirect(data.redirect_url)
  }

  const [, brand] = await Promise.all([logConsent("shown", { user, request, details: data }), brandOf(request.host)])
  const clientName = data.client.name || UNNAMED_CLIENT
  const site = webUrl(data.client.uri)
  const logo = webUrl(data.client.logo_uri)

  return (
    <Card>
      <CardHeader className="space-y-5">
        <div className="flex items-center gap-2.5">
          {/* Le nom est écrit à côté : le logo ne le répète pas aux lecteurs d'écran. */}
          <span aria-hidden className="flex">
            <AppLogo size={28} label={brand} />
          </span>
          <span className="font-semibold tracking-tight">{brand}</span>
        </div>
        <div className="flex items-start gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- hôte arbitraire du client : next/image exigerait de le déclarer dans next.config
            <img
              src={logo}
              alt=""
              width={40}
              height={40}
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-lg border bg-card object-contain"
            />
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="break-words text-xl font-semibold leading-tight tracking-tight">
              {clientName} demande l’accès à votre compte
            </h1>
            {site && (
              <a
                href={site}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-primary-dark hover:underline"
              >
                {site}
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          <Detail label="Compte">{data.user.email}</Detail>
          <Detail label="Adresse de retour">
            <code className="break-all font-mono text-sm">{data.redirect_uri}</code>
          </Detail>
          <Detail label="Scopes demandés">
            {/* Supabase omet `scope` quand il est vide (omitempty), malgré son type. */}
            <ScopeList scopes={(data.scope ?? "").split(/\s+/).filter(Boolean)} />
          </Detail>
        </dl>
      </CardContent>
      <CardFooter>
        <ConsentForm authorizationId={data.authorization_id} />
      </CardFooter>
    </Card>
  )
}

/** Nom de l'organisation servie par cet hôte, sinon la marque du banc (hôte inconnu, base ou clé absente). */
async function brandOf(host: string): Promise<string> {
  try {
    return (await resolveOrg(getOauthTestClient(), host))?.name ?? SITE_BRAND
  } catch (error) {
    console.error("[consent] resolveOrg", error)
    return SITE_BRAND
  }
}

/** URL http(s) déclarée par le client à son enregistrement, sinon null : jamais de `javascript:` en href. */
function webUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null
  } catch {
    return null
  }
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <dt className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Notice({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <WarningCircle aria-hidden className="h-8 w-8 text-destructive" />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
