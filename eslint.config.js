// Lint config (dev tooling only). Run: npm run lint
// Focus on mistakes that break the app at runtime (undefined names, unused
// leftovers), not on style.
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "data-processing/**", "bench/results/**"],
  },
  {
    files: ["script.js", "state.js", "idioms/**/*.js", "core/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, d3: "readonly" },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-dupe-keys": "error",
      "no-unreachable": "error",
    },
  },
  {
    files: ["tests/**/*.{js,mjs}", "bench/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Code inside page.evaluate() runs in the app page, where d3 is a global.
      globals: { ...globals.node, ...globals.browser, d3: "readonly" },
    },
    rules: { "no-undef": "error" },
  },
];
