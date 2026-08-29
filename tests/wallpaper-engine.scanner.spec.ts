import { describe, expect, it } from 'vitest'
import {
  classifyWallpaperType,
  parseJsonSafe,
  parseLibraryFoldersVdf,
  resolveProjectDetails,
} from '../src/wallpaper-engine/scanner.ts'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

describe('wallpaper-engine: scanner', () => {
  it('parseJsonSafe strips BOM and parses JSON', () => {
    const withBom = '\uFEFF{"title": "Test Wallpaper", "type": "video"}'
    const parsed = parseJsonSafe<{ title: string; type: string }>(withBom)
    expect(parsed).toEqual({ title: 'Test Wallpaper', type: 'video' })

    expect(parseJsonSafe('invalid json {')).toBeUndefined()
  })

  it('parseLibraryFoldersVdf parses Valve VDF library paths', () => {
    const vdf = `
"libraryfolders"
{
    "0"
    {
        "path"    "C:\\\\Program Files (x86)\\\\Steam"
        "label"   ""
        "apps"
        {
            "431960"    "12345"
        }
    }
    "1"
    {
        "path"    "D:\\\\SteamLibrary"
        "label"   "Games"
        "apps"
        {
            "431960"    "67890"
        }
    }
}
`
    const libraries = parseLibraryFoldersVdf(vdf)
    expect(libraries.length).toBe(2)
    expect(libraries[0]).toMatch(/Steam$/i)
    expect(libraries[1]).toMatch(/SteamLibrary$/i)
  })

  it('classifyWallpaperType correctly categorizes extensions and types', () => {
    expect(classifyWallpaperType('video', 'foo.mp4')).toBe('video')
    expect(classifyWallpaperType(undefined, 'movie.webm')).toBe('video')
    expect(classifyWallpaperType('scene', 'scene.pkg')).toBe('scene')
    expect(classifyWallpaperType('web', 'index.html')).toBe('web')
    expect(classifyWallpaperType('image', 'pic.png')).toBe('image')
    expect(classifyWallpaperType(undefined, 'picture.jpg')).toBe('image')
  })

  it('resolveProjectDetails resolves metadata and media from a directory', () => {
    const testDir = join(tmpdir(), `we-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    const projectJson = {
      title: 'Neon Sunset',
      type: 'video',
      file: 'sunset.mp4',
      preview: 'preview.jpg',
    }
    writeFileSync(join(testDir, 'project.json'), JSON.stringify(projectJson), 'utf8')
    writeFileSync(join(testDir, 'sunset.mp4'), 'fake mp4 data', 'utf8')
    writeFileSync(join(testDir, 'preview.jpg'), 'fake jpg data', 'utf8')

    const details = resolveProjectDetails(testDir)
    expect(details.title).toBe('Neon Sunset')
    expect(details.type).toBe('video')
    expect(details.mediaPath).toBe(join(testDir, 'sunset.mp4'))
    expect(details.previewPath).toBe(join(testDir, 'preview.jpg'))

    rmSync(testDir, { recursive: true, force: true })
  })
})
