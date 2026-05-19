/** @type {import('eslint').Linter.Config} */
// Migrated from Remix v1 (which provided @remix-run/eslint-config).
// React Router v7 doesn't ship an opinionated ESLint config; this is a
// minimal starting point — add plugins/rules as you want them. The build
// itself doesn't depend on ESLint, so this file is purely advisory.
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  ignorePatterns: ["build/", ".react-router/", "node_modules/", "app/utils/Lexical/"],
};
