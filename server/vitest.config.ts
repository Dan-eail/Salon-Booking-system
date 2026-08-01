import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://belle:belle_dev_password@localhost:5432/belle_test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-12',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
