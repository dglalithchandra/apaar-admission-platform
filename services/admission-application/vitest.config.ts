import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/postgres/migrate-cli.ts'],
      include: ['src/*.ts', 'src/postgres/config.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    include: ['test/unit/**/*.test.ts'],
  },
});
