/**
 * Client-side communication helpers for Wallpaper Engine endpoints.
 */
import type { ActiveWallpaperInfo, WallpaperInventoryItem, WallpaperInventoryResponse } from '../wallpaper-engine/types.ts'

/**
 * Fetch information about the currently active Wallpaper Engine wallpaper.
 */
export async function fetchCurrentWallpaper(): Promise<ActiveWallpaperInfo> {
  try {
    const res = await fetch('/api/ui-appearance/wallpaper-engine/current')
    if (!res.ok) {
      return { success: false, error: 'read_error' }
    }
    return (await res.json()) as ActiveWallpaperInfo
  } catch {
    return { success: false, error: 'not_found' }
  }
}

/**
 * Fetch the inventory list of all detected Wallpaper Engine wallpapers.
 */
export async function fetchWallpaperInventory(): Promise<WallpaperInventoryItem[]> {
  try {
    const res = await fetch('/api/ui-appearance/wallpaper-engine/inventory')
    if (!res.ok) return []
    const data = (await res.json()) as WallpaperInventoryResponse
    return data.wallpapers || []
  } catch {
    return []
  }
}

/**
 * Download a wallpaper media or preview as a Blob.
 */
export async function loadWallpaperBlob(url: string): Promise<Blob> {
  const separator = url.includes('?') ? '&' : '?'
  const fetchUrl = `${url}${separator}_t=${Date.now()}`
  const res = await fetch(fetchUrl, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load wallpaper resource from ${url} (status ${res.status})`)
  }
  return await res.blob()
}
