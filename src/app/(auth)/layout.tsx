// Cadre des pages d'auth (E03-S03) : connexion, consentement, clients autorisés, centrés sur le fond Tiple
// (halo, croix, grain), sans la barre latérale du tableau de bord. Sans lui, chacune des trois pages
// recopierait ce cadre.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="page-canvas noise-overlay flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md p-6">{children}</div>
    </main>
  )
}
