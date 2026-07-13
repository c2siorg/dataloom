module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  plugins: ["react-refresh"],
  env: { browser: true, es2020: true },
  settings: { react: { version: "18.2" } },
  ignorePatterns: ["dist", ".eslintrc.cjs", "node_modules/"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  rules: {
    "react/jsx-no-target-blank": "off",
    "react/prop-types": "off",
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ["**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      rules: {
        // Covered by tsc (noUnusedLocals); the core rule false-positives on
        // type-only constructs like interface members and type imports.
        "no-unused-vars": "off",
        "no-undef": "off",
      },
    },
    {
      files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"],
      env: { jest: true },
      globals: { vi: "readonly" },
      rules: {
        // Anonymous wrapper components (testing-library `wrapper:`) don't need names.
        "react/display-name": "off",
      },
    },
  ],
};
