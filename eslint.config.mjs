import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      'private-inputs/**',
      'reference/documents/**',
      'reference/source/**',
      'tmp/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        performance: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['tests/load/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __ITER: 'readonly',
        __VU: 'readonly',
      },
    },
  },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['services/**/*.ts', 'apps/**/*.{ts,tsx}'],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ['services/**/*.ts', 'apps/**/*.{ts,tsx}'],
  })),
  {
    files: ['services/**/*.ts', 'apps/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./services/*/tsconfig.lint.json', './apps/*/tsconfig.lint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },
  {
    files: ['services/**/test/**/*.ts', 'apps/**/*.test.{ts,tsx}', 'apps/**/*.stories.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
