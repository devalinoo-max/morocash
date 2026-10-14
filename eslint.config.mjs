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
    "next-env.d.ts",
    // Projets et sorties de build qui ne relèvent pas des règles Next :
    // le frontend Vite a sa propre vérification (tsc), le reste est généré.
    "frontend/**",
    "landing-redesign/**",
    "landing-static/**",
    "izikit/**",
    "src/generated/**",
  ]),
  {
    rules: {
      // `const { coutUnitaire, ...rest } = item` sert à RETIRER un champ :
      // la variable écartée n'est pas un oubli.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
