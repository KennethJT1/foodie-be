import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', 'docs/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(req|res|next)$' }],
      'no-console': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  // sequelize-cli loads these with require()
  { files: ['**/*.cjs', '.sequelizerc'], languageOptions: { sourceType: 'commonjs' } },
  // env.js prints why it refuses to boot before the logger exists
  { files: ['src/config/env.js'], rules: { 'no-console': 'off' } },
  { files: ['tests/**/*.js'], languageOptions: { globals: globals.jest } },
  prettier,
];
