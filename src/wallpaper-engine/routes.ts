/**
 * HTTP routes for Wallpaper Engine integration in DeepSeek Harness.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getCurrentWallpaper, getWallpaperInventory } from './scanner.ts'
import {
  extractSceneMainImage,
  extractSceneMainImageFromDir,
  extractTexVideoMp4,
  parsePkg,
  readPkgEntry,
} from './extractor.ts'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/**
 * Determine MIME type for a file extension.
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * Handle streaming a local file to an HTTP response with HTTP Range support (for videos).
 */
export function streamFile(
  filePath: string,
  req: IncomingMessage | { headers: Record<string, string | undefined> },
  res: ServerResponse | {
    statusCode?: number
    setHeader: (name: string, value: string | number) => void
    writeHead?: (status: number, headers: Record<string, string | number>) => void
    end: (chunk?: unknown) => void
    write?: (chunk: unknown) => boolean
  },
): void {
  if (!existsSync(filePath)) {
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
    } else {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
    }
    res.end('File not found')
    return
  }

  // 1. Packed scene.pkg: extract full resolution master texture
  if (filePath.toLowerCase().endsWith('.pkg')) {
    try {
      const data = readFileSync(filePath)
      const extracted = extractSceneMainImage(data)
      if (extracted) {
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          res.writeHead(200, {
            'Content-Length': extracted.bytes.length,
            'Content-Type': extracted.mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          })
        } else {
          res.statusCode = 200
          res.setHeader('Content-Length', extracted.bytes.length)
          res.setHeader('Content-Type', extracted.mime)
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.setHeader('Access-Control-Allow-Origin', '*')
        }
        res.end(extracted.bytes)
        return
      }
    } catch {
      // If static extraction failed, check for embedded video texture (MP4 inside TEX)
      try {
        const data = readFileSync(filePath)
        const entries = parsePkg(data)
        for (const entry of entries) {
          if (entry.path.toLowerCase().endsWith('.tex')) {
            const texBytes = readPkgEntry(data, entry)
            const mp4 = extractTexVideoMp4(texBytes)
            if (mp4) {
              if ('writeHead' in res && typeof res.writeHead === 'function') {
                res.writeHead(200, {
                  'Content-Length': mp4.length,
                  'Content-Type': 'video/mp4',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Access-Control-Allow-Origin': '*',
                })
              } else {
                res.statusCode = 200
                res.setHeader('Content-Length', mp4.length)
                res.setHeader('Content-Type', 'video/mp4')
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                res.setHeader('Access-Control-Allow-Origin', '*')
              }
              res.end(mp4)
              return
            }
          }
        }
      } catch {
        // Fall through to preview fallback
      }
    }

    // Fallback: if no 2D texture or video could be extracted, serve preview image
    const dir = dirname(filePath)
    for (const name of ['preview.jpg', 'preview.png', 'preview.gif', 'preview.jpeg']) {
      const prev = join(dir, name)
      if (existsSync(prev)) {
        streamFile(prev, req, res)
        return
      }
    }
  }

  // 2. Loose scene or JSON descriptor: extract from directory
  if (filePath.toLowerCase().endsWith('.json')) {
    const dir = dirname(filePath)
    const pkgPath = join(dir, 'scene.pkg')
    try {
      let extracted = null
      if (existsSync(pkgPath)) {
        extracted = extractSceneMainImage(readFileSync(pkgPath))
      } else {
        extracted = extractSceneMainImageFromDir(dir)
      }
      if (extracted) {
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          res.writeHead(200, {
            'Content-Length': extracted.bytes.length,
            'Content-Type': extracted.mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          })
        } else {
          res.statusCode = 200
          res.setHeader('Content-Length', extracted.bytes.length)
          res.setHeader('Content-Type', extracted.mime)
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.setHeader('Access-Control-Allow-Origin', '*')
        }
        res.end(extracted.bytes)
        return
      }
    } catch {
      // Ignore extraction failure and check directory preview fallback
    }

    // Fallback: if no master 2D texture was extracted from procedural/3D scene, serve preview image
    for (const name of ['preview.jpg', 'preview.png', 'preview.gif', 'preview.jpeg']) {
      const prev = join(dir, name)
      if (existsSync(prev)) {
        streamFile(prev, req, res)
        return
      }
    }
  }

  let stat
  try {
    stat = statSync(filePath)
    if (!stat.isFile()) throw new Error('Not a file')
  } catch {
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
    } else {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
    }
    res.end('Not a file')
    return
  }

  const fileSize = stat.size
  const mime = getMimeType(filePath)
  const rangeHeader = req.headers.range || req.headers.Range

  if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const startStr = parts[0]
    const endStr = parts[1]
    const start = startStr ? parseInt(startStr, 10) : 0
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      if ('writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
      } else {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${fileSize}`)
      }
      res.end()
      return
    }

    const chunksize = end - start + 1
    const stream = createReadStream(filePath, { start, end })
    stream.on('error', () => {
      // Safe error catch for abandoned client connections
    })

    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
      })
    } else {
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Length', chunksize)
      res.setHeader('Content-Type', mime)
      res.setHeader('Access-Control-Allow-Origin', '*')
    }

    if ('pipe' in stream && 'write' in res) {
      stream.pipe(res as unknown as NodeJS.WritableStream)
    }
  } else {
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      })
    } else {
      res.statusCode = 200
      res.setHeader('Content-Length', fileSize)
      res.setHeader('Content-Type', mime)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }

    const stream = createReadStream(filePath)
    stream.on('error', () => {
      // Safe error catch for abandoned client connections
    })

    if ('pipe' in stream && 'write' in res) {
      stream.pipe(res as unknown as NodeJS.WritableStream)
    }
  }
}

/**
 * Handle incoming HTTP requests for Wallpaper Engine endpoints.
 * Compatible with DSH host WebServer, Node http.Server, and Express/Koa.
 */
export function handleWallpaperEngineRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const urlString = req.url || '/'
  const parsedUrl = new URL(urlString, 'http://localhost')
  const pathname = parsedUrl.pathname
  const query = Object.fromEntries(parsedUrl.searchParams.entries())

  if (pathname === '/api/ui-appearance/wallpaper-engine/current') {
    const info = getCurrentWallpaper()
    if (info.success) {
      if (info.mediaPath) {
        info.mediaUrl = '/api/ui-appearance/wallpaper-engine/media/current'
      }
      if (info.previewPath) {
        info.previewUrl = '/api/ui-appearance/wallpaper-engine/preview/current'
      }
    }
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      })
    } else {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.end(JSON.stringify(info))
    return
  }

  if (pathname === '/api/ui-appearance/wallpaper-engine/inventory') {
    const wallpapers = getWallpaperInventory().map(item => ({
      ...item,
      previewUrl: item.previewPath
        ? `/api/ui-appearance/wallpaper-engine/preview?path=${encodeURIComponent(item.previewPath)}`
        : undefined,
      mediaUrl: item.mediaPath
        ? `/api/ui-appearance/wallpaper-engine/media?path=${encodeURIComponent(item.mediaPath)}`
        : undefined,
    }))
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      })
    } else {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.end(JSON.stringify({ success: true, wallpapers }))
    return
  }

  if (pathname === '/api/ui-appearance/wallpaper-engine/media/current') {
    const info = getCurrentWallpaper()
    const target = info.mediaPath || info.previewPath
    if (!info.success || !target) {
      if ('writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
      } else {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
      }
      res.end(JSON.stringify({ error: 'No active wallpaper media' }))
      return
    }
    streamFile(target, req, res)
    return
  }

  if (pathname === '/api/ui-appearance/wallpaper-engine/preview/current') {
    const info = getCurrentWallpaper()
    const target = info.previewPath || info.mediaPath
    if (!info.success || !target) {
      if ('writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
      } else {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
      }
      res.end(JSON.stringify({ error: 'No active wallpaper preview' }))
      return
    }
    streamFile(target, req, res)
    return
  }

  if (pathname === '/api/ui-appearance/wallpaper-engine/media') {
    const target = query.path
    if (!target) {
      if ('writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
      } else {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
      }
      res.end(JSON.stringify({ error: 'Missing path parameter' }))
      return
    }
    streamFile(target, req, res)
    return
  }

  if (pathname === '/api/ui-appearance/wallpaper-engine/preview') {
    const target = query.path
    if (!target) {
      if ('writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
      } else {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
      }
      res.end(JSON.stringify({ error: 'Missing path parameter' }))
      return
    }
    streamFile(target, req, res)
    return
  }

  if ('writeHead' in res && typeof res.writeHead === 'function') {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
  } else {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain')
  }
  res.end('Not found')
}

/**
 * Register Wallpaper Engine routes onto a router (Koa/Cordis router).
 */
export function registerWallpaperEngineRoutes(router: {
  get: (path: string, handler: (ctx: any) => Promise<void> | void) => void
}): void {
  router.get('/api/ui-appearance/wallpaper-engine/current', (ctx: any) => {
    const info = getCurrentWallpaper()
    if (info.success) {
      if (info.mediaPath) {
        info.mediaUrl = '/api/ui-appearance/wallpaper-engine/media/current'
      }
      if (info.previewPath) {
        info.previewUrl = '/api/ui-appearance/wallpaper-engine/preview/current'
      }
    }
    ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    ctx.body = info
  })

  router.get('/api/ui-appearance/wallpaper-engine/inventory', (ctx: any) => {
    const wallpapers = getWallpaperInventory().map(item => ({
      ...item,
      previewUrl: item.previewPath
        ? `/api/ui-appearance/wallpaper-engine/preview?path=${encodeURIComponent(item.previewPath)}`
        : undefined,
      mediaUrl: item.mediaPath
        ? `/api/ui-appearance/wallpaper-engine/media?path=${encodeURIComponent(item.mediaPath)}`
        : undefined,
    }))
    ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    ctx.body = {
      success: true,
      wallpapers,
    }
  })

  router.get('/api/ui-appearance/wallpaper-engine/media/current', (ctx: any) => {
    const info = getCurrentWallpaper()
    const target = info.mediaPath || info.previewPath
    if (!info.success || !target) {
      ctx.status = 404
      ctx.body = { error: 'No active wallpaper media' }
      return
    }
    ctx.respond = false
    streamFile(target, ctx.req, ctx.res)
  })

  router.get('/api/ui-appearance/wallpaper-engine/preview/current', (ctx: any) => {
    const info = getCurrentWallpaper()
    const target = info.previewPath || info.mediaPath
    if (!info.success || !target) {
      ctx.status = 404
      ctx.body = { error: 'No active wallpaper preview' }
      return
    }
    ctx.respond = false
    streamFile(target, ctx.req, ctx.res)
  })

  router.get('/api/ui-appearance/wallpaper-engine/media', (ctx: any) => {
    const rawPath = ctx.query?.path
    if (typeof rawPath !== 'string' || !rawPath) {
      ctx.status = 400
      ctx.body = { error: 'Missing path query parameter' }
      return
    }
    ctx.respond = false
    streamFile(rawPath, ctx.req, ctx.res)
  })

  router.get('/api/ui-appearance/wallpaper-engine/preview', (ctx: any) => {
    const rawPath = ctx.query?.path
    if (typeof rawPath !== 'string' || !rawPath) {
      ctx.status = 400
      ctx.body = { error: 'Missing path query parameter' }
      return
    }
    ctx.respond = false
    streamFile(rawPath, ctx.req, ctx.res)
  })
}
