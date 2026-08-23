import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // This client-heavy MVP intentionally hydrates Supabase state in effects.
    // Keep the existing data-loading model stable during the pilot hardening pass.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "supabase/.temp/**", "next-env.d.ts"]),
]);
