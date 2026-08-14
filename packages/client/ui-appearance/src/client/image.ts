/**
 * Browser-side image reading for the background upload: samples the source
 * brightness, then walks a (max-edge × quality) ladder — shrinking by edge
 * first, then lowering JPEG/WebP quality — until the encoded data URL fits the
 * storage budget. Falls back to the raw file data URL when the browser cannot
 * decode the format.
 */

/** Input file size cap (bytes); larger files are refused up front. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024

/** Storage budget for the persisted data URL (bytes of encoded payload). */
export const MAX_STORED_BYTES = 2 * 1024 * 1024

/** Max-edge ladder: shrink by dimension first. */
export const EDGE_LADDER = [1920, 1280, 960] as const

/** Quality ladder walked after each edge step. */
export const QUALITY_LADDER = [0.82, 0.74, 0.66, 0.58, 0.5] as const

/** Average-brightness threshold below which an image counts as dark. */
const IMAGE_DARK_THRESHOLD = 0.35

/** MIME types accepted by the upload controls. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

/** Result of reading and compressing one image file. */
export interface CompressedImage {
  /** Compressed data URL ready to persist. */
  url: string
  /** Whether the source sampled as dark (< 35% average brightness). */
  imageDark: boolean
}

/** One fitted canvas size. */
interface Size {
  /** Scaled width in px. */
  width: number
  /** Scaled height in px. */
  height: number
}

/**
 * Fit a bitmap so its longest edge is at most `maxEdge`, preserving aspect.
 * @param width - source width.
 * @param height - source height.
 * @param maxEdge - longest-edge bound in px.
 * @returns the fitted size.
 */
export function fitWithin(width: number, height: number, maxEdge: number): Size {
  const safe = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.round(v) : 1)
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxEdge) || maxEdge <= 0) {
    return { width: safe(width), height: safe(height) }
  }
  if (width <= 0 || height <= 0) return { width: safe(width), height: safe(height) }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Estimate the encoded payload bytes of a data URL from its length (base64).
 * @param dataUrl - the data URL.
 * @returns estimated bytes.
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return 0
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4)
}

/**
 * Sample the average brightness of a bitmap on a fixed small grid, so the
 * cost stays constant regardless of file size.
 * @param bmp - the decoded source bitmap.
 * @returns true when the average perceived luminance is below the dark threshold.
 */
export function sampleImageDarkness(bmp: ImageBitmap): boolean {
  const grid = 24
  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const context = canvas.getContext('2d')
  if (context === null) return false
  context.drawImage(bmp, 0, 0, grid, grid)
  let data: Uint8ClampedArray
  try {
    data = context.getImageData(0, 0, grid, grid).data
  } catch (_readbackUnavailable) {
    return false
  }
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    // Perceived luminance weights (ITU-R BT.601), 0..1.
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return sum / (grid * grid) < IMAGE_DARK_THRESHOLD
}

/**
 * Read, sample, and compress an image file into a data URL.
 * @param file - the selected image file.
 * @returns the compressed result, or falls back to the raw bytes.
 */
export async function readImageFile(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`unsupported file type "${file.type}"`)
  if (file.size > MAX_INPUT_BYTES) throw new Error(`image exceeds the ${MAX_INPUT_BYTES / 1024 / 1024}MB input limit`)
  const bitmap = await tryDecode(file)
  if (bitmap === undefined) {
    const raw = await readRawDataUrl(file)
    // The raw fallback bypasses the compression ladder, so it must still
    // respect the storage budget — an oversized original would bloat the
    // user-settings document.
    if (estimateDataUrlBytes(raw) > MAX_STORED_BYTES) {
      throw new Error(`image exceeds the ${MAX_STORED_BYTES / 1024 / 1024}MB storage budget`)
    }
    return { url: raw, imageDark: false }
  }
  try {
    const imageDark = sampleImageDarkness(bitmap)
    const url = await encodeWithinBudget(bitmap, file.type === 'image/png')
    if (url === undefined) throw new Error(`compressed image still exceeds the ${MAX_STORED_BYTES / 1024 / 1024}MB storage budget`)
    return { url, imageDark }
  } catch (_encodeUnavailable) {
    // Canvas unavailable (e.g. a restricted environment) or encoding failed:
    // hand back the original bytes rather than failing the upload.
    return { url: await readRawDataUrl(file), imageDark: false }
  } finally {
    bitmap.close()
  }
}

/** Decode the file to a bitmap, or undefined when the format is unsupported. */
async function tryDecode(file: File): Promise<ImageBitmap | undefined> {
  try {
    return await createImageBitmap(file)
  } catch (_unsupportedImageFormat) {
    return undefined
  }
}

/**
 * Walk the edge ladder, then the quality ladder, until an encode fits the
 * storage budget. WebP is preferred (smaller); browsers without WebP encode
 * fall back to JPEG at the same size and quality.
 * @param bitmap - decoded source.
 * @param keepAlpha - whether to keep a transparent channel (PNG).
 * @returns the first data URL within budget, or undefined when none fits.
 */
async function encodeWithinBudget(bitmap: ImageBitmap, keepAlpha: boolean): Promise<string | undefined> {
  for (const edge of EDGE_LADDER) {
    const size = fitWithin(bitmap.width, bitmap.height, edge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (ctx === null) continue
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    for (const quality of QUALITY_LADDER) {
      const url = encodeDataUrl(canvas, keepAlpha, quality)
      if (estimateDataUrlBytes(url) <= MAX_STORED_BYTES) return url
    }
  }
  return undefined
}

/**
 * Encode a canvas to a data URL: PNG keeps alpha; everything else tries WebP
 * first and falls back to JPEG. Both encode synchronously, so the byte budget
 * check can walk the ladder without waiting.
 */
function encodeDataUrl(canvas: HTMLCanvasElement, keepAlpha: boolean, quality: number): string {
  if (keepAlpha) return canvas.toDataURL('image/png')
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', quality)
}

/** Fallback: hand back the original file bytes when decoding is impossible. */
function readRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(reader.result as string) }
    reader.onerror = () => { reject(new Error('image read failed')) }
    reader.readAsDataURL(file)
  })
}
