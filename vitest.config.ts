import { defineConfig } from 'vitest/config'

// Minimal unit-test runner. Targets fast, dependency-free tests (pure logic and
// schema validation) that need no database or external services, so they run
// reliably in CI. Integration tests requiring Postgres/Redis/etc. are out of
// scope here.
export default defineConfig({
  test: {
    // Scope to package-level tests: pure logic / schema validation that run
    // without a database or the builder's `@/` path alias. App-level
    // (apps/builder) tests need that extra wiring and are out of scope here.
    include: ['packages/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      // Pulls in the isolated-vm native sandbox (heavy, ABI-sensitive) — outside
      // this runner's "pure logic, no external deps" scope.
      'packages/schemas/features/chat/**',
    ],
    // Dummy values so modules that import `@typebot.io/env` at load time pass
    // env validation. These tests never open a real connection.
    env: {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      ENCRYPTION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      NEXTAUTH_URL: 'https://example.com',
      COGNITO_ISSUER_URL: 'https://example.com',
      CLOUDCHAT_COGNITO_APP_CLIENT_ID: 'test-client-id',
      NEXT_PUBLIC_VIEWER_URL: 'https://example.com',
      MAX_LLM_BLOCK_VISITS_PER_SESSION: '100',
    },
  },
})
