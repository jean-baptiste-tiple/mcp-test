import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 exporte un flat config natif : l'ancien `FlatCompat` de `@eslint/eslintrc`
// plante dessus (« Converting circular structure to JSON »).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Sans ces ignores, `eslint .` linte le build output dès qu'un `pnpm build` local a eu lieu
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
