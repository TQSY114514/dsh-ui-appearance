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

/**
 * One selectable version within a multi-version Scene wallpaper.
 * Version 0 is always the primary (composite 2D layers); subsequent versions
 * correspond to embedded MP4/video textures, day/night variants, etc.
 */
export interface SceneVersion {
  /** 0-based index passed as `?version=N` to the /media route. */
  index: number
  /** Human-readable label (e.g. "主版本", "安全版", "视频版"). */
  label: string
  /** MIME type of the extracted media. */
  mime: 'image/png' | 'video/mp4'
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
  /**
   * Available versions for Scene wallpapers that contain multiple layers or
   * embedded video textures. Undefined / empty means single-version only.
   */
  versions?: SceneVersion[]
}

/** Response for the inventory listing endpoint. */
export interface WallpaperInventoryResponse {
  success: boolean
  wallpapers: WallpaperInventoryItem[]
  wallpaperEngineDir?: string
}
