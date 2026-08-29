/**
 * Scanner for detecting local Steam installations, Wallpaper Engine directories,
 * currently active wallpapers from config.json, and the installed wallpaper library.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import type {
  ActiveWallpaperInfo,
  WallpaperEngineProject,
  WallpaperInventoryItem,
} from './types.ts'

const WE_APP_ID = '431960'
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

/**
 * Remove UTF-8 BOM and parse JSON safely, returning undefined on failure.
 */
export function parseJsonSafe<T>(content: string): T | undefined {
  try {
    const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    return JSON.parse(clean) as T
  } catch {
    return undefined
  }
}

/**
 * Parse a Valve Data Format (VDF) libraryfolders.vdf file to extract all library paths.
 */
export function parseLibraryFoldersVdf(vdfContent: string): string[] {
  const paths: string[] = []
  const regex = /"path"\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(vdfContent)) !== null) {
    const rawPath = match[1]
    if (rawPath) {
      // VDF escapes backslashes (e.g. "D:\\SteamLibrary")
      const unescaped = rawPath.replace(/\\\\/g, '\\')
      paths.push(normalize(unescaped))
    }
  }
  return paths
}

/**
 * Try to query the Windows registry for the Steam installation path.
 */
function getSteamPathFromRegistry(): string[] {
  if (platform() !== 'win32') return []
  const paths: string[] = []
  const queries = [
    'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
    'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
    'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath',
  ]
  for (const cmd of queries) {
    try {
      const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 1000 })
      const match = /REG_SZ\s+(.+)$/m.exec(output)
      if (match?.[1]) {
        const found = match[1].trim()
        if (existsSync(found)) paths.push(normalize(found))
      }
    } catch {
      // Registry key missing or reg command failed
    }
  }
  return paths
}

function normalizePathKey(p: string): string {
  return resolve(p).toLowerCase().replace(/\\/g, '/')
}

/**
 * Find candidate Steam root directories on the local machine.
 */
export function getCandidateSteamRoots(): string[] {
  const candidates = new Map<string, string>()
  const addCandidate = (p: string | undefined): void => {
    if (!p) return
    const key = normalizePathKey(p)
    if (!candidates.has(key)) candidates.set(key, p)
  }

  const osType = platform()

  if (osType === 'win32') {
    for (const regPath of getSteamPathFromRegistry()) {
      addCandidate(regPath)
    }
    const drives = ['C', 'D', 'E', 'F', 'G', 'H']
    const programFiles = process.env.ProgramFiles
    const programFilesX86 = process.env['ProgramFiles(x86)']
    if (programFilesX86) addCandidate(join(programFilesX86, 'Steam'))
    if (programFiles) addCandidate(join(programFiles, 'Steam'))

    for (const drive of drives) {
      addCandidate(`${drive}:\\Steam`)
      addCandidate(`${drive}:\\SteamLibrary`)
      addCandidate(`${drive}:\\Program Files (x86)\\Steam`)
      addCandidate(`${drive}:\\Program Files\\Steam`)
    }
  } else if (osType === 'darwin') {
    addCandidate(join(homedir(), 'Library/Application Support/Steam'))
  } else {
    // Linux / BSD
    addCandidate(join(homedir(), '.steam/steam'))
    addCandidate(join(homedir(), '.steam/root'))
    addCandidate(join(homedir(), '.local/share/Steam'))
    // WSL Windows mount points
    for (const drive of ['c', 'd', 'e', 'f', 'g']) {
      addCandidate(`/mnt/${drive}/Program Files (x86)/Steam`)
      addCandidate(`/mnt/${drive}/Program Files/Steam`)
      addCandidate(`/mnt/${drive}/Steam`)
      addCandidate(`/mnt/${drive}/SteamLibrary`)
    }
  }

  return Array.from(candidates.values()).filter(p => {
    try {
      return existsSync(p) && statSync(p).isDirectory()
    } catch {
      return false
    }
  })
}

/**
 * Discover all Steam library folders across all mounted drives.
 */
export function findSteamLibraries(): string[] {
  const libraries = new Map<string, string>()
  const addLib = (p: string | undefined): void => {
    if (!p) return
    const key = normalizePathKey(p)
    if (!libraries.has(key)) libraries.set(key, p)
  }

  const roots = getCandidateSteamRoots()

  for (const root of roots) {
    addLib(root)
    const vdfPath = join(root, 'steamapps', 'libraryfolders.vdf')
    if (existsSync(vdfPath)) {
      try {
        const vdfContent = readFileSync(vdfPath, 'utf8')
        const extraLibraries = parseLibraryFoldersVdf(vdfContent)
        for (const lib of extraLibraries) {
          if (existsSync(lib)) addLib(lib)
        }
      } catch {
        // Ignore unreadable VDF
      }
    }
  }

  return Array.from(libraries.values())
}

/**
 * Locate the Wallpaper Engine installation directory.
 */
export function findWallpaperEngineDir(libraries?: string[]): string | undefined {
  const libs = libraries ?? findSteamLibraries()
  for (const lib of libs) {
    const candidate = join(lib, 'steamapps', 'common', 'wallpaper_engine')
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate
    }
  }
  return undefined
}

/**
 * Classify wallpaper type from project type and extension.
 */
export function classifyWallpaperType(
  declaredType?: string,
  filePath?: string,
): 'video' | 'scene' | 'web' | 'image' {
  const t = declaredType?.toLowerCase()
  if (t === 'video') return 'video'
  if (t === 'scene') return 'scene'
  if (t === 'web') return 'web'
  if (t === 'image' || t === 'picture') return 'image'

  if (filePath) {
    const ext = extname(filePath).toLowerCase()
    if (VIDEO_EXTENSIONS.has(ext)) return 'video'
    if (IMAGE_EXTENSIONS.has(ext)) return 'image'
    if (ext === '.html' || ext === '.htm') return 'web'
    if (ext === '.pkg' || ext === '.json') return 'scene'
  }

  return 'image'
}

/**
 * Resolve project details from a project.json path or a directory/file containing it.
 */
export function resolveProjectDetails(targetPath: string): {
  project?: WallpaperEngineProject
  folderPath: string
  mediaPath?: string
  previewPath?: string
  type: 'video' | 'scene' | 'web' | 'image'
  title: string
} {
  let folderPath = targetPath
  if (existsSync(targetPath)) {
    try {
      if (statSync(targetPath).isFile()) {
        folderPath = dirname(targetPath)
      }
    } catch {
      // Keep targetPath
    }
  } else if (extname(targetPath)) {
    folderPath = dirname(targetPath)
  }

  const jsonPath = join(folderPath, 'project.json')
  let project: WallpaperEngineProject | undefined
  if (existsSync(jsonPath)) {
    try {
      const content = readFileSync(jsonPath, 'utf8')
      project = parseJsonSafe<WallpaperEngineProject>(content)
    } catch {
      // Ignore read failure
    }
  }

  const rawFile = project?.file
  const rawPreview = project?.preview
  const declaredType = project?.type
  const title = project?.title || basename(folderPath)

  let mediaPath: string | undefined
  let previewPath: string | undefined

  // 1. If scene.pkg exists in the folder, it is the master package for the scene
  const pkgCandidate = join(folderPath, 'scene.pkg')
  if (existsSync(pkgCandidate)) {
    mediaPath = pkgCandidate
  } else if (rawFile) {
    const candidate = isAbsolute(rawFile) ? rawFile : resolve(folderPath, rawFile)
    if (existsSync(candidate)) mediaPath = candidate
  }

  if (rawPreview) {
    const candidate = isAbsolute(rawPreview) ? rawPreview : resolve(folderPath, rawPreview)
    if (existsSync(candidate)) previewPath = candidate
  }

  // Look for fallback preview images in directory if none specified or missing
  if (!previewPath) {
    for (const name of ['preview.jpg', 'preview.png', 'preview.gif', 'preview.jpeg']) {
      const candidate = resolve(folderPath, name)
      if (existsSync(candidate)) {
        previewPath = candidate
        break
      }
    }
  }

  // If targetPath is an existing media file directly (e.g. .mp4, .png), preserve it
  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    const ext = extname(targetPath).toLowerCase()
    if (VIDEO_EXTENSIONS.has(ext)) {
      mediaPath = targetPath
    } else if (IMAGE_EXTENSIONS.has(ext) && !previewPath) {
      previewPath = targetPath
    }
  }

  const type = classifyWallpaperType(declaredType, mediaPath || rawFile || targetPath)

  // If mediaPath is still missing, search directory for video or scene descriptor
  if (!mediaPath) {
    if (type === 'video') {
      try {
        const files = readdirSync(folderPath)
        const vid = files.find(f => VIDEO_EXTENSIONS.has(extname(f).toLowerCase()))
        if (vid) mediaPath = join(folderPath, vid)
      } catch {
        // Ignore read error
      }
    } else if (type === 'scene') {
      try {
        const files = readdirSync(folderPath)
        const sceneFile = files.find(f => f === 'scene.json') || files.find(f => f !== 'project.json' && f.toLowerCase().endsWith('.json'))
        if (sceneFile) mediaPath = join(folderPath, sceneFile)
      } catch {
        // Ignore read error
      }
    } else if (type === 'image') {
      mediaPath = previewPath
    }
  }

  return {
    project,
    folderPath,
    mediaPath,
    previewPath,
    type,
    title,
  }
}

/**
 * Deep search for selectedwallpapers object in Wallpaper Engine config.json.
 */
export function findSelectedWallpapers(obj: unknown): Record<string, unknown> | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined
  
  const root = obj as Record<string, unknown>
  for (const profileName of Object.keys(root)) {
    const profile = root[profileName]
    if (typeof profile === 'object' && profile !== null) {
      const general = (profile as Record<string, unknown>).general
      if (typeof general === 'object' && general !== null) {
        const wallpaperconfig = (general as Record<string, unknown>).wallpaperconfig
        if (typeof wallpaperconfig === 'object' && wallpaperconfig !== null) {
          const selected = (wallpaperconfig as Record<string, unknown>).selectedwallpapers
          if (typeof selected === 'object' && selected !== null && Object.keys(selected).length > 0) {
            return selected as Record<string, unknown>
          }
        }
      }
    }
  }

  return undefined
}

/**
 * Get details of the currently active wallpaper from Wallpaper Engine's config.json.
 */
export function getCurrentWallpaper(weDir?: string): ActiveWallpaperInfo {
  const dir = weDir ?? findWallpaperEngineDir()
  if (!dir) {
    return { success: false, error: 'not_found' }
  }

  const configPath = join(dir, 'config.json')
  if (!existsSync(configPath)) {
    return { success: false, error: 'not_found' }
  }

  let configContent = ''
  try {
    configContent = readFileSync(configPath, 'utf8')
  } catch {
    return { success: false, error: 'read_error' }
  }

  const config = parseJsonSafe<Record<string, unknown>>(configContent)
  if (!config) {
    return { success: false, error: 'unreadable_config' }
  }

  const selected = findSelectedWallpapers(config)
  if (!selected || Object.keys(selected).length === 0) {
    return { success: false, error: 'no_active_wallpaper' }
  }

  // Iterate displays, preferring primary display (Monitor0, DISPLAY1) or first valid wallpaper
  let chosenMonitor = ''
  let rawWallpaperPath = ''

  for (const [monitor, val] of Object.entries(selected)) {
    let filePath = ''
    if (typeof val === 'string') {
      filePath = val
    } else if (typeof val === 'object' && val !== null) {
      filePath = (val as { file?: string }).file || ''
    }

    if (filePath) {
      chosenMonitor = monitor
      rawWallpaperPath = filePath
      // Prioritize primary display (Monitor0, DISPLAY1)
      if (/monitor0|display1/i.test(monitor)) {
        break
      }
    }
  }

  if (!rawWallpaperPath) {
    return { success: false, error: 'no_active_wallpaper' }
  }

  const resolvedTarget = isAbsolute(rawWallpaperPath)
    ? rawWallpaperPath
    : resolve(dir, rawWallpaperPath)

  const details = resolveProjectDetails(resolvedTarget)

  return {
    success: true,
    monitor: chosenMonitor,
    title: details.title,
    type: details.type,
    mediaPath: details.mediaPath,
    previewPath: details.previewPath,
    folderPath: details.folderPath,
  }
}

/**
 * Scan all installed wallpapers in Wallpaper Engine projects and workshop folders.
 */
export function getWallpaperInventory(weDir?: string, libraries?: string[]): WallpaperInventoryItem[] {
  const dir = weDir ?? findWallpaperEngineDir(libraries)
  const libs = libraries ?? findSteamLibraries()
  const items: WallpaperInventoryItem[] = []
  const seenFolders = new Set<string>()
  const seenIds = new Set<string>()

  const scanDirectory = (parentDir: string): void => {
    if (!existsSync(parentDir)) return
    try {
      const entries = readdirSync(parentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folder = join(parentDir, entry.name)
          const normKey = normalizePathKey(folder)
          const idKey = entry.name.toLowerCase()
          if (seenFolders.has(normKey) || seenIds.has(idKey)) continue
          seenFolders.add(normKey)
          seenIds.add(idKey)

          const jsonPath = join(folder, 'project.json')
          if (existsSync(jsonPath)) {
            const details = resolveProjectDetails(folder)
            items.push({
              id: entry.name,
              title: details.title,
              type: details.type,
              folderPath: details.folderPath,
              mediaPath: details.mediaPath,
              previewPath: details.previewPath,
            })
          }
        }
      }
    } catch {
      // Ignore scan error for individual directory
    }
  }

  if (dir) {
    scanDirectory(join(dir, 'projects', 'defaultprojects'))
    scanDirectory(join(dir, 'projects', 'myprojects'))
  }

  for (const lib of libs) {
    scanDirectory(join(lib, 'steamapps', 'workshop', 'content', WE_APP_ID))
  }

  return items
}
