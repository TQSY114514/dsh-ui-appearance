/**
 * Standalone vitest configuration: the tests import the plugin's own src and
 * three unpublished @deepseek-ai runtime packages, which only exist inside a
 * harness checkout. The aliases below swap those value imports for the
 * minimal stubs in tests/stubs (type-only imports are erased and never hit
 * the resolver). Run with `pnpm test`.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-runtime/client': fileURLToPath(new URL('./tests/stubs/runtime.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-web-react': fileURLToPath(new URL('./tests/stubs/web-react.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
})
