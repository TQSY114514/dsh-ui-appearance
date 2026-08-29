/**
 * Data structures for Wallpaper Engine metadata and communication.
 */

/** Wallpaper Engine project.json structure. */
export interface WallpaperEngineProject {
  title?: string
  type?: 'video' | 'scene' | 'web' | 'image' | 'preset' | string
  file?: string
  preview?: string
  description?: string
  contentrating?: string
  tags?: string[]
  general?: {
    properties?: Record<string, unknown>
  }
}

/** Resolved details of the currently active wallpaper in Wallpaper Engine. */
export interface ActiveWallpaperInfo {
  success: boolean
  error?: 'not_found' | 'no_active_wallpaper' | 'unreadable_config' | 'read_error'
  monitor?: string
  title?: string
  type?: 'video' | 'scene' | 'web' | 'image'
  /** Absolute path on host filesystem. */
  mediaPath?: string
  /** Absolute path on host filesystem for preview image. */
  previewPath?: string
  /** Directory containing the project. */
  folderPath?: string
  /** Media URL relative to DSH server. */
  mediaUrl?: string
  /** Preview URL relative to DSH server. */
  previewUrl?: string
}

/** One item in the Wallpaper Engine local inventory list. */
export interface WallpaperInventoryItem {
  id: string
  title: string
  type: 'video' | 'scene' | 'web' | 'image'
  folderPath: string
  mediaPath?: string
  previewPath?: string
  previewUrl?: string
  mediaUrl?: string
}

/** Response for the inventory listing endpoint. */
export interface WallpaperInventoryResponse {
  success: boolean
  wallpapers: WallpaperInventoryItem[]
  wallpaperEngineDir?: string
}
