/**
 * Browser-side image reading for the background upload: samples the source
 * brightness, then walks a (max-edge × quality) ladder — shrinking by edge
 * first, then lowering JPEG/WebP quality — until the encoded data URL fits the
 * storage budget. Falls back to the raw file data URL when the browser cannot
 * decode the format.
 */

/** Input file size cap (bytes); larger files are refused up front. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024

/** Storage budget for the persisted data URL (bytes of encoded payload). */
export const MAX_STORED_BYTES = 2 * 1024 * 1024

/** Max-edge ladder: shrink by dimension first. */
export const EDGE_LADDER = [1920, 1280, 960] as const

/** Quality ladder walked after each edge step. */
export const QUALITY_LADDER = [0.82, 0.74, 0.66, 0.58, 0.5] as const

/** Average-brightness threshold below which an image counts as dark. */
const IMAGE_DARK_THRESHOLD = 0.35

/** Hue buckets for the accent sampler (12 bins of 30°). */
const ACCENT_HUE_BUCKETS = 12

/** Saturation floor for a pixel to count toward the accent (ignores grays). */
const ACCENT_MIN_SATURATION = 0.18

/** Target lightness the sampled accent is normalized to. */
const ACCENT_TARGET_LIGHTNESS = 0.46

/** Target saturation the sampled accent is normalized to. */
const ACCENT_TARGET_SATURATION = 0.5

/** MIME types accepted by the upload controls. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

/** Result of reading and compressing one image file. */
export interface CompressedImage {
  /** Compressed data URL ready to persist. */
  url: string
  /** Whether the source sampled as dark (< 35% average brightness). */
  imageDark: boolean
  /** Dominant accent color sampled from the source, or null when absent. */
  accent: string | null
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
 * Sample a dominant, readable accent color from a bitmap: bucket pixels by
 * hue (ignoring near-gray and near-black/white), weight each bucket by its
 * saturation, take the strongest bucket's average RGB, then normalize the
 * hue-preserving lightness/saturation so the result works as an accent on
 * light surfaces (dark enough for white text). Pure utility — no DOM.
 * @param bmp - the decoded source bitmap.
 * @returns a `#rrggbb` hex, or null when the image has no usable hue.
 */
export function sampleAccentColor(bmp: ImageBitmap): string | null {
  const grid = 32
  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.drawImage(bmp, 0, 0, grid, grid)
  let data: Uint8ClampedArray
  try {
    data = context.getImageData(0, 0, grid, grid).data
  } catch (_readbackUnavailable) {
    return null
  }
  // Bucket accumulator: hue-bucket → [rSum, gSum, bSum, count, satSum].
  const buckets = new Array<[number, number, number, number, number]>(ACCENT_HUE_BUCKETS)
  for (let i = 0; i < ACCENT_HUE_BUCKETS; i += 1) buckets[i] = [0, 0, 0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255
    const g = data[i + 1]! / 255
    const b = data[i + 2]! / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    // Skip near-black, near-white, and near-gray pixels: they carry no hue.
    if (l < 0.08 || l > 0.92 || max - min < ACCENT_MIN_SATURATION) continue
    let hue = 0
    if (max === min) continue
    const delta = max - min
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    else if (max === g) hue = ((b - r) / delta + 2) / 6
    else hue = ((r - g) / delta + 4) / 6
    const bucket = Math.min(ACCENT_HUE_BUCKETS - 1, Math.floor(hue * ACCENT_HUE_BUCKETS))
    const acc = buckets[bucket]!
    acc[0] += r
    acc[1] += g
    acc[2] += b
    acc[3] += 1
    acc[4] += delta
  }
  let best: [number, number, number, number, number] | undefined
  let bestScore = -1
  for (const acc of buckets) {
    if (acc[3] === 0) continue
    // Score = count × average saturation: a big colorful region wins.
    const score = acc[3] * (acc[4]! / acc[3])
    if (score > bestScore) {
      bestScore = score
      best = acc
    }
  }
  if (best === undefined) return null
  const [rSum, gSum, bSum, count] = best
  const r = rSum! / count!
  const g = gSum! / count!
  const b = bSum! / count!
  return hslToHex(rgbToHsl(r, g, b, ACCENT_TARGET_SATURATION, ACCENT_TARGET_LIGHTNESS))
}

/** RGB (0..1) → HSL, optionally re-clamped to the given saturation/lightness. */
function rgbToHsl(r: number, g: number, b: number, sat?: number, light?: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const delta = max - min
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / delta + 2) / 6
    else h = ((r - g) / delta + 4) / 6
  }
  return [h, sat ?? s, light ?? l]
}
/** HSL (h: 0..1, s/l: 0..1) → `#rrggbb`. */
function hslToHex([h, s, l]: [number, number, number]): string {
  const hue = (h - Math.floor(h)) * 6
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number]
  if (hue < 1) rgb = [c, x, 0]
  else if (hue < 2) rgb = [x, c, 0]
  else if (hue < 3) rgb = [0, c, x]
  else if (hue < 4) rgb = [0, x, c]
  else if (hue < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

/** One derived palette entry: role → hex. */
export interface DerivedPalette {
  /** Deep background tint carrying the wallpaper hue. */
  background: string
  /** Panel, one lightness step above the background. */
  panel: string
  /** Composer input, one lightness step above the panel. */
  input: string
  /** Muted border derived from the accent. */
  border: string
}

/**
 * Derive a coordinated dark palette from one accent color: the background
 * family steps through lightness (background → panel → input), so the
 * surfaces share the wallpaper hue without all being the same color. The
 * text role is deliberately left alone — the user's text color stays in
 * control.
 * @param accentHex - the sampled accent (`#rrggbb`).
 * @returns the derived role colors.
 */
export function derivePalette(accentHex: string): DerivedPalette {
  const [h, s] = rgbToHsl(...hexToRgb(accentHex))
  const hex = (sat: number, light: number): string => hslToHex([h, sat, light])
  return {
    background: hex(s * 0.35, 0.1),
    panel: hex(s * 0.35, 0.16),
    input: hex(s * 0.35, 0.21),
    border: hex(s * 0.25, 0.34),
  }
}

/** `#rrggbb` → RGB (0..1). */
function hexToRgb(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
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
    return { url: raw, imageDark: false, accent: null }
  }
  try {
    const imageDark = sampleImageDarkness(bitmap)
    const accent = sampleAccentColor(bitmap)
    const url = await encodeWithinBudget(bitmap, file.type === 'image/png')
    if (url === undefined) throw new Error(`compressed image still exceeds the ${MAX_STORED_BYTES / 1024 / 1024}MB storage budget`)
    return { url, imageDark, accent }
  } catch (_encodeUnavailable) {
    // Canvas unavailable (e.g. a restricted environment) or encoding failed:
    // hand back the original bytes rather than failing the upload.
    return { url: await readRawDataUrl(file), imageDark: false, accent: null }
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
  // A data URL is ~4/3 the file size plus its prefix, so a file at or above
  // the storage budget can never fit — reject before reading.
  if (file.size > MAX_STORED_BYTES) {
    return Promise.reject(new Error(`image too large (${file.size} bytes) to persist without re-encoding`))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(reader.result as string) }
    reader.onerror = () => { reject(new Error('image read failed')) }
    reader.readAsDataURL(file)
  })
}
