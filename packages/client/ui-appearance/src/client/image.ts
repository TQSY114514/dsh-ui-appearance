/**
 * Browser-side image reading for the background upload: downscales to a
 * bounded width and re-encodes so the data URL stays small enough for the
 * user-settings document. Falls back to the raw file data URL when the
 * browser cannot decode the format.
 */

/** Longest edge allowed after downscaling (px). */
export const MAX_IMAGE_DIMENSION = 1920

/** JPEG quality when re-encoding (0..1). */
export const JPEG_QUALITY = 0.85

/** Worst-case data URL budget before a second, smaller re-encode (chars). */
const DATA_URL_BUDGET = 2_400_000

/** MIME types accepted by the upload controls. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

/**
 * Read and compress an image file into a data URL.
 * @param file - the selected image file.
 * @returns a compressed data URL ready to persist.
 */
export async function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`unsupported file type "${file.type}"`)
  const bitmap = await tryDecode(file)
  if (bitmap === undefined) return readRawDataUrl(file)
  try {
    const scaled = scaleBitmap(bitmap, MAX_IMAGE_DIMENSION)
    const dataUrl = await encodeScaled(scaled, file.type === 'image/png', JPEG_QUALITY)
    if (dataUrl.length <= DATA_URL_BUDGET) return dataUrl
    // Still oversized: halve the dimension and drop the quality once more.
    const smaller = scaleBitmap(bitmap, Math.max(320, Math.round(MAX_IMAGE_DIMENSION / 2)))
    return await encodeScaled(smaller, file.type === 'image/png', 0.6)
  } catch (_reencodeUnavailable) {
    // Canvas unavailable (e.g. a restricted environment) or encoding failed:
    // hand back the original bytes rather than failing the upload.
    return readRawDataUrl(file)
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

/** Scale a bitmap so its longest edge is at most `maxDim`, preserving aspect. */
function scaleBitmap(bitmap: ImageBitmap, maxDim: number): HTMLCanvasElement {
  const longest = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, maxDim / longest)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('canvas 2d context unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

/**
 * Encode a canvas to a data URL. PNG keeps alpha; everything else becomes a
 * smaller JPEG (the background is a full-viewport layer, alpha rarely needed).
 */
function encodeScaled(canvas: HTMLCanvasElement, keepAlpha: boolean, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('image encode failed'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => { resolve(reader.result as string) }
      reader.onerror = () => { reject(new Error('image read failed')) }
      reader.readAsDataURL(blob)
    }, keepAlpha ? 'image/png' : 'image/jpeg', quality)
  })
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
