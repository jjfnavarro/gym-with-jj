import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'tests/unit.test.ts',
      'tests/ui.test.tsx',
      'tests/server.test.ts',
      'tests/push-worker.test.ts',
    ],
    environment: 'node',
    testTimeout: 10000,
  },
});
