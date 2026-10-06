import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Only the security kernel may write the access matrix or create/destroy entities (spec §4.1).
const KERNEL_ONLY_REPOSITORIES = {
  patterns: [
    {
      group: ['**/matrix.repository*', '**/object-mutation.repository*'],
      message: 'Only src/kernel/** (and src/container.ts) may import kernel-only repositories.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'data/'] },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
    rules: {
      'no-restricted-imports': ['error', KERNEL_ONLY_REPOSITORIES],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/kernel/**/*.ts', 'src/container.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['public/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
