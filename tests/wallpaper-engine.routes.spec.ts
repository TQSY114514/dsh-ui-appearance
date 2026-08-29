import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getMimeType, registerWallpaperEngineRoutes, streamFile } from '../src/wallpaper-engine/routes.ts'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Writable } from 'node:stream'

describe('wallpaper-engine: routes', () => {
  const testDir = join(tmpdir(), `we-route-test-${Date.now()}`)
  const testFile = join(testDir, 'sample.txt')

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(testFile, 'Hello Wallpaper Engine World', 'utf8')
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('getMimeType maps media extensions properly', () => {
    expect(getMimeType('video.mp4')).toBe('video/mp4')
    expect(getMimeType('video.webm')).toBe('video/webm')
    expect(getMimeType('pic.jpg')).toBe('image/jpeg')
    expect(getMimeType('pic.png')).toBe('image/png')
    expect(getMimeType('pic.webp')).toBe('image/webp')
    expect(getMimeType('unknown.xyz')).toBe('application/octet-stream')
  })

  it('streamFile handles 200 and range requests', async () => {
    // 200 OK test
    const headers200: Record<string, string | number> = {}
    const dummyWritable200 = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    const res200 = Object.assign(dummyWritable200, {
      statusCode: 0,
      setHeader: (k: string, v: string | number) => { headers200[k] = v },
      end: vi.fn(),
    })

    streamFile(testFile, { headers: {} }, res200)
    expect(res200.statusCode).toBe(200)
    expect(headers200['Content-Length']).toBe(28)

    // 206 Partial Content test
    const headers206: Record<string, string | number> = {}
    const dummyWritable206 = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    const res206 = Object.assign(dummyWritable206, {
      statusCode: 0,
      setHeader: (k: string, v: string | number) => { headers206[k] = v },
      end: vi.fn(),
    })

    streamFile(testFile, { headers: { range: 'bytes=0-4' } }, res206)
    expect(res206.statusCode).toBe(206)
    expect(headers206['Content-Length']).toBe(5)
    expect(headers206['Content-Range']).toBe('bytes 0-4/28')

    // 404 Not Found test
    const res404 = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    }
    streamFile(join(testDir, 'nonexistent.mp4'), { headers: {} }, res404)
    expect(res404.statusCode).toBe(404)
  })

  it('registerWallpaperEngineRoutes registers all expected endpoints', () => {
    const registeredRoutes: string[] = []
    const mockRouter = {
      get: (path: string) => {
        registeredRoutes.push(path)
      },
    }

    registerWallpaperEngineRoutes(mockRouter)
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/current')
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/inventory')
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/media/current')
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/preview/current')
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/media')
    expect(registeredRoutes).toContain('/api/ui-appearance/wallpaper-engine/preview')
  })

  it('streamFile supports versionIndex argument', () => {
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    }
    // Calling with nonexistent file and versionIndex should still 404 gracefully
    streamFile(join(testDir, 'nonexistent.pkg'), { headers: {} }, res, 1)
    expect(res.statusCode).toBe(404)
  })
})
