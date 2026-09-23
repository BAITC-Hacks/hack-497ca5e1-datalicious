import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["openai", "openai/*"], message: "Import the OpenAI SDK only inside src/server." }]
      }]
    }
  },
  {
    files: ["src/{components,data,domain}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["openai", "openai/*", "@/server", "@/server/*", "**/server", "**/server/**"], message: "This module must not depend on server code or the OpenAI SDK." }
        ]
      }]
    }
  }
]);
