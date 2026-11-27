/**
 * Real-browser Chromium CSS & WCAG contrast regression suite configuration.
 * Separated from default jsdom unit tests and executed via `pnpm test:browser`.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/browser/**/*.browser.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
