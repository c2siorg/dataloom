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
      files: ["**/__tests__/**/*.{js,jsx}", "**/*.test.{js,jsx}"],
      env: { jest: true },
      globals: { vi: "readonly" },
    },
  ],
};
