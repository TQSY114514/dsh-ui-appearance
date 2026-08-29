/**
 * Host registration for the appearance plugin.
 *
 * Exposes Wallpaper Engine discovery and media routes when running on the host,
 * while keeping client appearance settings in browser localStorage and IndexedDB.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleWallpaperEngineRequest, registerWallpaperEngineRoutes } from './wallpaper-engine/routes.ts'

export {
  APPEARANCE_SETTINGS_NAMESPACE, APPEARANCE_ROLES, DEFAULT_SETTINGS,
  type AppearanceRole, type AppearanceSettings,
} from './appearance-settings.ts'

export * from './wallpaper-engine/types.ts'
export {
  getCurrentWallpaper,
  getWallpaperInventory,
  findWallpaperEngineDir,
  findSteamLibraries,
  resolveProjectDetails,
  classifyWallpaperType,
} from './wallpaper-engine/scanner.ts'
export {
  registerWallpaperEngineRoutes,
  handleWallpaperEngineRequest,
  streamFile,
  getMimeType,
} from './wallpaper-engine/routes.ts'

/** Required host service injection for HTTP endpoints. */
export const inject = ['webServer']

/**
 * Host apply: registers Wallpaper Engine API endpoints onto DSH webServer.
 * @param ctx - Host context.
 */
export function apply(ctx: Context): void {
  const ws = (ctx as any).webServer
  if (ws && typeof ws.register === 'function') {
    ws.register({
      kind: 'prefix',
      path: '/api/ui-appearance/wallpaper-engine',
      handler: (req: IncomingMessage, res: ServerResponse) => {
        handleWallpaperEngineRequest(req, res)
      },
    })
  }
}
