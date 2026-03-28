import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ...js.configs.recommended,
    files: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
  })),
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    ignores: ["dist/**", "node_modules/**", ".vitest-temp/**", "**/*.d.ts", "**/*.js", "tests/fixtures/**"]
  }
];