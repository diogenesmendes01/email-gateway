/**
 * ESLint Configuration for Email Gateway
 * TASK-022: Type Safety Enforcement
 *
 * This configuration enforces strict type safety rules:
 * - Forbids @ts-ignore (use @ts-expect-error instead)
 * - Requires descriptions for all @ts-expect-error (min 10 chars)
 * - Restricts explicit 'any' usage
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist/',
    'node_modules/',
    'coverage/',
    '*.config.js',
    '*.config.ts',
  ],
  rules: {
    // TASK-022: Enforce type safety

    // Forbid @ts-ignore, require descriptions for @ts-expect-error
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-expect-error': {
          descriptionFormat: '^\\s*\\S.*$', // Require non-empty description
        },
        'ts-ignore': true, // Always forbidden - use @ts-expect-error instead
        'ts-nocheck': true, // Don't disable checking for entire files
        'ts-check': false, // Allow enabling checking (rare but valid)
        minimumDescriptionLength: 10, // Force meaningful descriptions
      },
    ],

    // Prefer @ts-expect-error over @ts-ignore
    '@typescript-eslint/prefer-ts-expect-error': 'error',

    // Restrict explicit 'any' usage - prefer unknown + type guards
    '@typescript-eslint/no-explicit-any': [
      'warn', // Warn instead of error to allow gradual adoption
      {
        ignoreRestArgs: true, // Allow ...args: any[] for function wrappers
        fixToUnknown: true, // Suggest 'unknown' as fix
      },
    ],

    // Other TypeScript best practices
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_', // Allow unused args starting with _
        varsIgnorePattern: '^_', // Allow unused vars starting with _
        caughtErrorsIgnorePattern: '^_', // Allow unused catch errors with _
      },
    ],

    // Prettier integration
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],

    // General best practices
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error', 'info'], // Allow warn/error/info for logging
      },
    ],
    'no-debugger': 'error',
    'no-alert': 'error',
  },

  // Override rules for test files
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**/*.ts'],
      env: {
        jest: true,
      },
      rules: {
        // More lenient rules for tests
        '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' in tests for mocking
        'no-console': 'off', // Allow console in tests for debugging
      },
    },
    {
      files: ['scripts/**/*.ts'],
      rules: {
        // Scripts can use console.log
        'no-console': 'off',
      },
    },
  ],
};
