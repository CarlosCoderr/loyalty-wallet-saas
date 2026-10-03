import { defineConfig } from 'vitest/config';
import { testEnv } from './test/test-env.js';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    env: testEnv,
    // Todas las pruebas comparten la BD _test y la resetean: un archivo a la vez
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
