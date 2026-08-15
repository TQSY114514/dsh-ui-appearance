/**
 * Standalone build preset for the appearance plugin 鈥?a self-contained port
 * of the harness repo's `packages/client/tsdown.client.ts`, so this package
 * builds OUTSIDE the deepseek-harness checkout (the dsh-web-ui skins' pattern:
 * `dsh plugin add <path-or-git-url>` runs `prepare` and produces lib/ with no
 * project references). Emits the node half (lib/index.js + lib/invariant.js)
 * from source and the browser bundle (lib/client.js) with the
 * `window.__ModuleLoader__.load` closure shape; CSS Modules are inlined by
 * lightningcss and injected as a loader-owned <style data-plugin-css> tag.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** The shell's frozen module table (mirrors packages/client/web/src/platform.ts). */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Documented runtime exemption: the snapshot-store engine lives in runtime. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Vendored framework libraries the client bundle inlines. */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Wire/type layers a client bundle may inline (none used by this plugin). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Externals resolved from the loader module table. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

const PACKAGE_ID = 'dsh-ui-appearance'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Rebase a physical lib-relative source onto a browser URL mirroring the repository directories. */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return repositoryPath.startsWith('packages/') ? `../../../${repositoryPath}` : source
}

/** Bundle purity gate: every @deepseek-ai value import must be a platform module or inline-safe. */
const purityGate = {
  name: 'dsh-client-bundle-purity',
  resolveId(source: string) {
    if (!source.startsWith('@deepseek-ai/')) return null
    if (CLIENT_EXTERNALS.includes(source)) return null
    if (VENDORED_LIBRARY.test(source)) return null
    if (INLINE_SAFE.test(source)) return null
    throw new Error(
      `client bundle purity: "${source}" is not a platform module or inline-safe wire layer 鈥?`
      + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
    )
  },
}

/** CSS Modules: compile with lightningcss and inject a loader-owned <style> tag. */
const cssModulesInline = {
  name: 'dsh-css-modules-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(this: { addWatchFile: (id: string) => void }, virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${PACKAGE_ID}/${basename(fileId)}`)};`,
      'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
      '  const tag = document.createElement(\'style\');',
      `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(classMap)};`,
    ].join('\n')
  },
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

/** Node half: bundled straight from source, deps external (host provides them). */
const nodeConfig: UserConfig = {
  name: PACKAGE_ID,
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  // Emits lib/index.d.ts + lib/invariant.d.ts (unresolved @deepseek-ai peers
  // are externalized in declaration mode, so the host-provided types resolve
  // at the consumer).
  dts: true,
  clean: false,
  tsconfig: 'tsconfig.json',
}

/** Browser half: closure-factory artifact landing exactly at lib/client.js. */
const clientConfig: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // The CJS closure cannot get a tsdown-emitted declaration (peers are not
  // installed here); types/client.d.ts mirrors the public surface instead.
  // copy's `to` is a DIRECTORY (dest = to/<basename>), so omit it to land in
  // outDir as lib/client.d.ts.
  dts: false,
  sourcemap: true,
  clean: false,
  tsconfig: 'tsconfig.json',
  copy: [{ from: 'types/client.d.ts' }],
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [purityGate, cssModulesInline],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapPathTransform: browserSourcePath,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeConfig, clientConfig]
