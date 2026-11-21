/**
 * Verify published package contents, zero-dependency host ESM entrypoints,
 * and client CJS bundle syntax before release or CI pass.
 */
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
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
]

const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'scripts/', '.github/']

const raw = execSync('npm pack --dry-run --json --ignore-scripts', {
  cwd: rootDir,
  encoding: 'utf8',
})
const packResult = JSON.parse(raw)
assert(Array.isArray(packResult) && packResult.length > 0, 'npm pack returned no metadata')

const filePaths = packResult[0].files.map((entry) => entry.path.replaceAll('\\', '/'))

for (const required of REQUIRED_FILES) {
  assert(filePaths.includes(required), `Missing required tarball file: ${required}`)
}

for (const filePath of filePaths) {
  for (const prefix of FORBIDDEN_PREFIXES) {
    assert(!filePath.startsWith(prefix), `Forbidden source/dev file leaked into tarball: ${filePath}`)
  }
  assert(!filePath.endsWith('.tgz'), `Nested tarball leaked into tarball: ${filePath}`)
}

const indexMod = await import(pathToFileURL(resolve(rootDir, 'lib/index.js')).href)
assert.equal(typeof indexMod.apply, 'function', 'lib/index.js must export apply()')
assert(
  typeof indexMod.DEFAULT_SETTINGS === 'object' && indexMod.DEFAULT_SETTINGS !== null,
  'lib/index.js must export DEFAULT_SETTINGS object',
)

const invariantMod = await import(pathToFileURL(resolve(rootDir, 'lib/invariant.js')).href)
assert.equal(typeof invariantMod.apply, 'function', 'lib/invariant.js must export apply()')
assert(
  typeof invariantMod.name === 'string' && invariantMod.name.length > 0,
  'lib/invariant.js must export non-empty name',
)
assert(Array.isArray(invariantMod.inject), 'lib/invariant.js must export inject array')

const clientCode = readFileSync(resolve(rootDir, 'lib/client.js'), 'utf8')
assert(clientCode.trim().length > 0, 'lib/client.js must not be empty')
new vm.Script(clientCode, { filename: 'lib/client.js' })

console.log(
  `verify-pack: OK (${filePaths.length} tarball files, ESM exports [apply, DEFAULT_SETTINGS, invariant], client CJS syntax valid)`,
)
