/**
 * Real-browser Chromium CSS & WCAG contrast regression suite configuration.
 * Separated from default jsdom unit tests and executed via `pnpm test:browser`.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-runtime/client': fileURLToPath(new URL('./tests/stubs/runtime.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-store': fileURLToPath(new URL('./tests/stubs/runtime.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-web-react': fileURLToPath(new URL('./tests/stubs/web-react.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url)),
    },
  },
  test: {
    include: ['tests/browser/**/*.browser.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
