// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const convexPlugin = require('@convex-dev/eslint-plugin');

const convexRecommendedRules = {
  '@convex-dev/import-wrong-runtime': 'off',
  '@convex-dev/no-old-registered-function-syntax': 'error',
  '@convex-dev/require-args-validator': 'error',
  '@convex-dev/explicit-table-ids': 'error',
  '@convex-dev/no-filter-in-query': 'warn',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    files: ['convex/**/*.ts'],
    plugins: {
      '@convex-dev': convexPlugin,
    },
    rules: {
      ...convexRecommendedRules,
      '@convex-dev/no-collect-in-query': 'warn',
    },
  },
  {
    files: ['convex/migrations/**'],
    rules: {
      '@convex-dev/no-collect-in-query': 'off',
    },
  },
]);
