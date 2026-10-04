import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "drizzle/**",
      "scripts/**",
      // Catálogo de verticales de referencia: contiene proyectos Next
      // autónomos, no archivos fuente de la aplicación Control Chats.
      "vocero-verticales/**",
      "next-env.d.ts",
      ".tmp-seed-demo.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
