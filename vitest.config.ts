import { configDefaults, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // Tests de méthode du template (hooks, gate, reçu, synchro) hors de la suite : sous Vitest 3,
    // la suite complète sort en « Timeout calling onTaskUpdate » (deux runs sur deux le
    // 2026-11-25). À retirer à la montée Vitest 5 (lot stack). Lançables à la main :
    // METHOD_TESTS=1 pnpm exec vitest run tests/unit/hooks.test.ts
    exclude: process.env.METHOD_TESTS
      ? configDefaults.exclude
      : [
          ...configDefaults.exclude,
          "tests/unit/{hooks,check-framework-invariants,long-run,sync-method}.test.ts",
        ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
