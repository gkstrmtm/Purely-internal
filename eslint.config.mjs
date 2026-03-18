import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "mobile-app/**",
    "next-env.d.ts",
  ]),

  // Repo-wide overrides: keep lint useful without blocking on legacy typing debt.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-html-link-for-pages": "off",

      // These rules are too restrictive for the current codebase patterns and
      // can block linting on common, safe React usage.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },

  // Node scripts in /scripts are CommonJS and may legitimately use require().
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Guardrail: portal funnel-builder APIs must be variant-aware.
  // Importing the credit-only session helper here can cause cross-account leakage
  // when a browser has both portal + credit cookies.
  {
    files: ["src/app/api/portal/funnel-builder/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/creditPortalAccess",
              message:
                "Do not use credit-only sessions in /api/portal/funnel-builder. Use requireFunnelBuilderSession() (variant-aware) instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
