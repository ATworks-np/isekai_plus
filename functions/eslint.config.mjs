/**
 * This codebase is plain CommonJS running on Node, not the Next.js app.
 *
 * It previously extended next/core-web-vitals through FlatCompat — a copy of
 * the app's config that had no business linting Cloud Functions, and that broke
 * outright once eslint-config-next moved to flat config, since FlatCompat
 * cannot wrap one. That failure blocked `firebase deploy`, because the
 * functions predeploy hook runs this lint.
 */
export default [
  {
    ignores: ['node_modules/**', 'lib/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
]
