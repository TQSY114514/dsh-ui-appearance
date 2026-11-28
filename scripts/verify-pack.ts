/**
 * Verify published package contents, zero-dependency host ESM entrypoints,
 * and client CJS ModuleLoader sandbox execution before release or CI pass.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const REQUIRED_FILES = [
  'lib/index.js',
  'lib/index.d.ts',
  'lib/invariant.js',
  'lib/invariant.d.ts',
  'lib/client.js',
  'lib/client.d.ts',
  'cordis.patch.yml',
  'package.json',
] as const

const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'scripts/', '.github/'] as const

const MAX_CLIENT_BYTES = 512 * 1024
const MAX_CLIENT_MAP_BYTES = 1024 * 1024

// Mirrors CLIENT_EXTERNALS in tsdown.standalone.config.ts (dsh.client.inject entries
// like -locale, -ui-settings, and -ui-theme are type-only and rejected as value
// imports by the purity gate).
const ALLOWED_CLIENT_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
])

const REQUIRED_CLIENT_EXTERNALS = [
  'react',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

interface PackFileEntry {
  path: string
}

interface PackMetadata {
  files: PackFileEntry[]
}

interface ModuleLoaderEntry {
  id: string
  factory: (requireFn: (specifier: string) => unknown) => Record<string, unknown>
}

function runPnpmPackDryRun(): string {
  const userAgent = process.env.npm_config_user_agent ?? ''
  const pnpmExec = process.env.npm_execpath
  const packArgs = ['--config.ignore-scripts=true', 'pack', '--dry-run', '--json']
  const isPnpm = userAgent.startsWith('pnpm/') || /pnpm/i.test(pnpmExec ?? '')
  if (isPnpm && pnpmExec && /\.(c|m)?js$/i.test(pnpmExec)) {
    return execFileSync(process.execPath, [pnpmExec, ...packArgs], {
      cwd: rootDir,
      encoding: 'utf8',
    })
  }
  return execFileSync('pnpm', packArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function isPackMetadata(value: unknown): value is PackMetadata {
  if (typeof value !== 'object' || value === null || !('files' in value)) return false
  const { files } = value as { files: unknown }
  return Array.isArray(files) && files.every(
    (entry) => typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string',
  )
}

const raw = runPnpmPackDryRun()
const parsed: unknown = JSON.parse(raw.trim())
const packMeta: unknown = Array.isArray(parsed) ? parsed[0] : parsed
assert(isPackMetadata(packMeta), `Unexpected pnpm pack --json payload:\n${raw}`)

const filePaths = packMeta.files.map((entry) => entry.path.replaceAll('\\', '/'))

for (const required of REQUIRED_FILES) {
  assert(filePaths.includes(required), `Missing required tarball file: ${required}`)
}

for (const filePath of filePaths) {
  for (const prefix of FORBIDDEN_PREFIXES) {
    assert(!filePath.startsWith(prefix), `Forbidden source/dev file leaked into tarball: ${filePath}`)
  }
  assert(!filePath.endsWith('.tgz'), `Nested tarball leaked into tarball: ${filePath}`)
}

const indexMod = (await import(pathToFileURL(resolve(rootDir, 'lib/index.js')).href)) as Record<string, unknown>
assert.equal(typeof indexMod.apply, 'function', 'lib/index.js must export apply()')
assert(
  typeof indexMod.DEFAULT_SETTINGS === 'object' && indexMod.DEFAULT_SETTINGS !== null,
  'lib/index.js must export DEFAULT_SETTINGS object',
)

const invariantMod = (await import(pathToFileURL(resolve(rootDir, 'lib/invariant.js')).href)) as Record<string, unknown>
assert.equal(typeof invariantMod.apply, 'function', 'lib/invariant.js must export apply()')
assert(
  typeof invariantMod.name === 'string' && invariantMod.name.length > 0,
  'lib/invariant.js must export non-empty name',
)
assert(Array.isArray(invariantMod.inject), 'lib/invariant.js must export inject array')

const clientBuffer = readFileSync(resolve(rootDir, 'lib/client.js'))
assert(clientBuffer.byteLength > 0, 'lib/client.js must not be empty')
assert(
  clientBuffer.byteLength < MAX_CLIENT_BYTES,
  `lib/client.js is unexpectedly large (${clientBuffer.byteLength} bytes >= ${MAX_CLIENT_BYTES}); check externalization`,
)
const clientMapBuffer = readFileSync(resolve(rootDir, 'lib/client.js.map'))
assert(clientMapBuffer.byteLength > 0, 'lib/client.js.map must not be empty')
assert(
  clientMapBuffer.byteLength < MAX_CLIENT_MAP_BYTES,
  `lib/client.js.map is unexpectedly large (${clientMapBuffer.byteLength} bytes >= ${MAX_CLIENT_MAP_BYTES})`,
)
const clientCode = clientBuffer.toString('utf8')

const capturedLoads: ModuleLoaderEntry[] = []
const sandbox: Record<string, unknown> = {
  window: {
    __ModuleLoader__: {
      load(entry: ModuleLoaderEntry) {
        capturedLoads.push(entry)
      },
    },
  },
  console,
  URL,
  setTimeout,
  clearTimeout,
}
const context = vm.createContext(sandbox)
new vm.Script(clientCode, { filename: 'lib/client.js' }).runInContext(context)

assert.equal(capturedLoads.length, 1, `Expected 1 __ModuleLoader__.load() call, got ${capturedLoads.length}`)
const [loaderEntry] = capturedLoads
assert.equal(loaderEntry.id, 'dsh-ui-appearance', 'Unexpected ModuleLoader plugin id')
assert.equal(typeof loaderEntry.factory, 'function', 'ModuleLoader entry must provide a factory function')

const requestedExternals = new Set<string>()
const stubProxy = new Proxy(
  {},
  {
    get: () => () => null,
  },
)
const mockRequire = (specifier: string): unknown => {
  requestedExternals.add(specifier)
  if (specifier === '@deepseek-ai/dsh-client-store') {
    return {
      defineStore: () => ({ create: () => ({}) }),
    }
  }
  return stubProxy
}

const clientExports = loaderEntry.factory(mockRequire)
assert(typeof clientExports === 'object' && clientExports !== null, 'Client factory must return an exports object')

for (const specifier of requestedExternals) {
  assert(
    ALLOWED_CLIENT_EXTERNALS.has(specifier),
    `Unexpected external required by lib/client.js: ${specifier}`,
  )
}
for (const requiredExternal of REQUIRED_CLIENT_EXTERNALS) {
  assert(
    requestedExternals.has(requiredExternal),
    `Expected host external "${requiredExternal}" to stay externalized in lib/client.js`,
  )
}

assert.equal(typeof clientExports.apply, 'function', 'lib/client.js must export apply()')
assert(
  Array.isArray(clientExports.inject) && clientExports.inject.length > 0,
  'lib/client.js must export non-empty inject array',
)
assert(
  typeof clientExports.SETTINGS_NS === 'string' && clientExports.SETTINGS_NS.length > 0,
  'lib/client.js must export non-empty SETTINGS_NS',
)
assert(
  typeof clientExports.STORAGE_KEY === 'string' && clientExports.STORAGE_KEY.length > 0,
  'lib/client.js must export non-empty STORAGE_KEY',
)

const clientKb = (clientBuffer.byteLength / 1000).toFixed(1)
const clientMapKb = (clientMapBuffer.byteLength / 1000).toFixed(1)
console.log(
  `verify-pack: OK (${filePaths.length} tarball files, ESM [apply, DEFAULT_SETTINGS, invariant], client.js ${clientKb} kB, map ${clientMapKb} kB / ${requestedExternals.size} externals / exports [apply, inject, SETTINGS_NS, STORAGE_KEY])`,
)
