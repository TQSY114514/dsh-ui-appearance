// @vitest-environment jsdom
/** Image reading: rejection, brightness sampling, compression ladder, raw fallback. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  estimateDataUrlBytes, fitWithin, MAX_INPUT_BYTES, MAX_STORED_BYTES,
  readImageFile, sampleImageDarkness,
} from '../src/client/image.ts'

/** Fake 2d context with controllable luminance readback. */
function fakeContext(dark: boolean) {
  const pixels = new Uint8ClampedArray(24 * 24 * 4)
  const shade = dark ? 10 : 240
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = shade
    pixels[i + 1] = shade
    pixels[i + 2] = shade
    pixels[i + 3] = 255
  }
  return {
    drawImage: vi.fn(),
    getImageData: () => ({ data: pixels }),
  }
}

/** Stub the canvas surface: fake context + controllable toDataURL output. */
function stubCanvas(toDataUrl: () => string) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return null as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataUrl)
}

function stubBitmapSource(dark: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return fakeContext(dark) as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/webp;base64,AAAA')
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn(async (_file: File) => ({
    width: 4000,
    height: 2000,
    close: vi.fn(),
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const jpegFile = (): File => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

describe('fitWithin', () => {
  it('caps the longest edge while preserving aspect', () => {
    expect(fitWithin(4000, 2000, 1920)).toEqual({ width: 1920, height: 960 })
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 })
  })

  it('guards malformed input', () => {
    expect(fitWithin(0, 100, 1920)).toEqual({ width: 1, height: 100 })
    expect(fitWithin(Number.NaN, 100, 0)).toEqual({ width: 1, height: 100 })
  })
})

describe('estimateDataUrlBytes', () => {
  it('estimates base64 payload bytes from the length', () => {
    expect(estimateDataUrlBytes('data:image/webp;base64,AAAA')).toBe(3)
    expect(estimateDataUrlBytes('no-comma')).toBe(0)
  })
})

describe('sampleImageDarkness', () => {
  it('flags an image whose average brightness is below the threshold', () => {
    stubBitmapSource(true)
    expect(sampleImageDarkness({ width: 24, height: 24 } as unknown as ImageBitmap)).toBe(true)
  })

  it('keeps a bright image unflagged', () => {
    stubBitmapSource(false)
    expect(sampleImageDarkness({ width: 24, height: 24 } as unknown as ImageBitmap)).toBe(false)
  })

  it('degrades to false when the canvas is unavailable', () => {
    stubCanvas(() => 'data:image/webp;base64,AAAA')
    expect(sampleImageDarkness({ width: 24, height: 24 } as unknown as ImageBitmap)).toBe(false)
  })
})

describe('readImageFile', () => {
  it('rejects non-image files', async () => {
    await expect(readImageFile(new File(['x'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow()
  })

  it('rejects files above the input size cap', async () => {
    const big = jpegFile()
    Object.defineProperty(big, 'size', { value: MAX_INPUT_BYTES + 1 })
    await expect(readImageFile(big)).rejects.toThrow()
  })

  it('compresses and reports the sampled darkness', async () => {
    stubBitmapSource(true)
    const result = await readImageFile(jpegFile())
    expect(result.url.startsWith('data:')).toBe(true)
    expect(result.imageDark).toBe(true)
  })

  it('walks the quality ladder when the first encode is oversized', async () => {
    const calls: Array<string | undefined> = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return fakeContext(true) as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
      this: HTMLCanvasElement,
      type?: string,
      _quality?: number,
    ) {
      calls.push(type)
      // First attempt (webp@0.82 at 1920) over budget -> walk down the ladder.
      if (calls.length === 1) return `data:image/webp;base64,${'A'.repeat(MAX_STORED_BYTES * 4)}`
      return 'data:image/webp;base64,AAAA'
    })
    const result = await readImageFile(jpegFile())
    expect(result.url.startsWith('data:')).toBe(true)
    expect(result.imageDark).toBe(true)
    expect(calls.length).toBeGreaterThan(1)
    expect(calls[1]).toBe('image/webp')
  })

  it('falls back to the raw file bytes when the canvas path fails', async () => {
    stubCanvas(() => 'data:image/webp;base64,AAAA')
    const result = await readImageFile(jpegFile())
    expect(result.url.startsWith('data:image/jpeg')).toBe(true)
    expect(result.imageDark).toBe(false)
  })

  it('falls back to the raw file bytes when decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode failed') }))
    const result = await readImageFile(jpegFile())
    expect(result.url.startsWith('data:image/jpeg')).toBe(true)
    expect(result.imageDark).toBe(false)
  })
})
