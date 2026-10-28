import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/index.ts',
        'src/pilot-execution-postgres.ts',
        'src/pilot-postgres.ts',
        'src/postgres-store.ts',
        'src/oversight-postgres.ts',
        'src/verification-authorization-postgres.ts',
        'src/migrate-reference.ts',
        'src/portal-server.ts',
        'src/postgres-delegated-transport.ts',
        'src/reference-persistence.ts',
        'src/reference-runtime.ts',
        'src/reset-reference.ts',
        'src/seed-reference.ts',
        'src/server.ts',
        'src/worker.ts',
      ],
      include: ['src/**/*.ts'],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
    exclude: ['test/integration/**/*.test.ts'],
  },
});
