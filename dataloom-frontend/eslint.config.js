import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // plugin:react/recommended and plugin:react/jsx-runtime both set this, and
      // without it any JSX in a .js or .jsx file is a hard parse error.
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    settings: {
      react: { version: "18.2" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // plugin:@typescript-eslint/recommended layers eslint-recommended (which
      // switches off the core rules that false-positive on TypeScript syntax)
      // underneath its own rules. Both layers are needed: dropping the first
      // turns rules like no-redeclare and no-unreachable back on for .ts/.tsx.
      ...tseslint.configs["flat/eslint-recommended"].rules,
      ...tseslint.configs.recommended.rules,
      // Covered by tsc (noUnusedLocals); the core rule false-positives on
      // type-only constructs like interface members and type imports.
      "no-unused-vars": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
        vi: "readonly",
      },
    },
    rules: {
      // Anonymous wrapper components (testing-library `wrapper:`) don't need names.
      "react/display-name": "off",
    },
  },
  prettier,
];
