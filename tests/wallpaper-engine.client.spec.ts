import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchCurrentWallpaper,
  fetchWallpaperInventory,
  loadWallpaperBlob,
} from '../src/client/wallpaper-engine.ts'

describe('wallpaper-engine: client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchCurrentWallpaper parses active wallpaper info on success', async () => {
    const mockData = {
      success: true,
      title: 'City Lights',
      type: 'video',
      mediaUrl: '/api/ui-appearance/wallpaper-engine/media/current',
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetchCurrentWallpaper()
    expect(result.success).toBe(true)
    expect(result.title).toBe('City Lights')
    expect(result.type).toBe('video')
  })

  it('fetchCurrentWallpaper returns failure object on error or 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    const result = await fetchCurrentWallpaper()
    expect(result.success).toBe(false)
    expect(result.error).toBe('read_error')
  })

  it('fetchWallpaperInventory returns list of wallpapers', async () => {
    const mockList = [
      { id: '123', title: 'Wallpaper 1', type: 'image' },
      { id: '456', title: 'Wallpaper 2', type: 'video' },
    ]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, wallpapers: mockList }),
    })

    const list = await fetchWallpaperInventory()
    expect(list.length).toBe(2)
    expect(list[0]?.title).toBe('Wallpaper 1')
  })

  it('loadWallpaperBlob retrieves blob data from URL', async () => {
    const fakeBlob = new Blob(['sample data'], { type: 'image/jpeg' })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => fakeBlob,
    })

    const blob = await loadWallpaperBlob('/api/ui-appearance/wallpaper-engine/preview/current')
    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBe(11)
  })
})
