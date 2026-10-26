import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/index.ts',
        'src/pilot-execution-postgres.ts',
        'src/pilot-postgres.ts',
        'src/postgres-store.ts',
        'src/server.ts',
      ],
      include: ['src/**/*.ts'],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
    exclude: ['test/integration/**/*.test.ts'],
  },
});
