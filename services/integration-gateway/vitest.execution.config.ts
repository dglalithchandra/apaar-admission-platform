import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    include: ['test/integration/pilot-execution-postgres.test.ts'],
    testTimeout: 60_000,
  },
});
