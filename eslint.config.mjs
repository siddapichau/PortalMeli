const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  fetch: 'readonly', AbortController: 'readonly', setTimeout: 'readonly',
  clearTimeout: 'readonly', console: 'readonly', AbortSignal: 'readonly'
};

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'test-results/**'] },
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...browserGlobals, globalThis: 'readonly' }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      eqeqeq: ['error', 'always']
    }
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...browserGlobals, globalThis: 'readonly', process: 'readonly',
        URL: 'readonly', Buffer: 'readonly', Response: 'readonly',
        Headers: 'readonly', Request: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      eqeqeq: ['error', 'always']
    }
  }
];
