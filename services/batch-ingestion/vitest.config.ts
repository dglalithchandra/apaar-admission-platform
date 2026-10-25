import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/postgres/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
    include: ['test/unit/**/*.test.ts'],
  },
});
