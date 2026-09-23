import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Configuration minimale — personnaliser par projet
  async rewrites() {
    return [
      // Métadonnées RFC 9728 du serveur auth-test sous la ressource : certains hosts les cherchent là au lieu
      // de les insérer après l'hôte (RFC 9728 §3.1 ; README du starter MCP, « variantes rewrites »). Sans
      // cette réécriture, ils lisent un 404 et ne découvrent jamais le serveur d'autorisation. La route reçoit
      // l'URL d'origine : src/auth-test/http.ts l'admet et la journalise telle quelle.
      {
        source: "/api/auth-test/mcp/.well-known/oauth-protected-resource",
        destination: "/.well-known/oauth-protected-resource/api/auth-test/mcp",
      },
    ]
  },
}

export default nextConfig
