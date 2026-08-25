// @vitest-environment jsdom
/** Image preparation: rejection, brightness sampling, edge-bound resampling, pass-through. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  derivePalette, fitWithin, MAX_INPUT_BYTES, prepareImage, RESAMPLE_EDGE,
  sampleAccentColor, sampleImageDarkness,
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

describe('sampleAccentColor', () => {
  it('returns null for hue-less (gray) images', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return fakeContext(true) as unknown as CanvasRenderingContext2D
    })
    expect(sampleAccentColor({ width: 24, height: 24 } as unknown as ImageBitmap)).toBeNull()
  })

  it('extracts a readable accent from a dominant hue', () => {
    const pixels = new Uint8ClampedArray(32 * 32 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 220
      pixels[i + 1] = 40
      pixels[i + 2] = 40
      pixels[i + 3] = 255
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return { drawImage: vi.fn(), getImageData: () => ({ data: pixels }) } as unknown as CanvasRenderingContext2D
    })
    const hex = sampleAccentColor({ width: 32, height: 32 } as unknown as ImageBitmap)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    const r = Number.parseInt(hex!.slice(1, 3), 16)
    const b = Number.parseInt(hex!.slice(5, 7), 16)
    // Normalized to a mid-tone red: clearly more red than blue.
    expect(r).toBeGreaterThan(b + 50)
  })
})

describe('derivePalette', () => {
  it('derives a coordinated dark family with lightness steps, not identical colors', () => {
    const palette = derivePalette('#c04040')
    expect(palette.background).toMatch(/^#[0-9a-f]{6}$/)
    // Lightness steps: panel > background, input > panel (all dark hues).
    const light = (hex: string): number => {
      const r = Number.parseInt(hex.slice(1, 3), 16) / 255
      const g = Number.parseInt(hex.slice(3, 5), 16) / 255
      const b = Number.parseInt(hex.slice(5, 7), 16) / 255
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
    }
    const bg = light(palette.background)
    const panel = light(palette.panel)
    const input = light(palette.input)
    expect(panel).toBeGreaterThan(bg)
    expect(input).toBeGreaterThan(panel)
    // The family keeps the hue: red-dominant background.
    const r = Number.parseInt(palette.background.slice(1, 3), 16)
    const b = Number.parseInt(palette.background.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
    // The text role is deliberately not part of the palette: the user's
    // text color stays in control.
    expect(palette).not.toHaveProperty('text')
  })
})

describe('prepareImage', () => {
  it('rejects non-image files', async () => {
    await expect(prepareImage(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(/unsupported file type/)
  })

  it('rejects files above the input size cap', async () => {
    const big = jpegFile()
    Object.defineProperty(big, 'size', { value: MAX_INPUT_BYTES + 1 })
    await expect(prepareImage(big)).rejects.toThrow(/input limit/)
  })

  it('passes sources within the edge bound through as-is with sampled metadata', async () => {
    stubBitmapSource(true)
    const source = jpegFile()
    const result = await prepareImage(source)
    // Same reference: no re-encode below the edge bound (GIF animation survives).
    expect(result.blob).toBe(source)
    expect(result.imageDark).toBe(true)
  })

  it('resamples oversized sources down to the edge bound', async () => {
    stubBitmapSource(true)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: RESAMPLE_EDGE + 1000,
      height: 2000,
      close: vi.fn(),
    })))
    const drawn: Array<[number, number]> = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return {
        // Only the resampling call passes explicit target dimensions.
        drawImage: (_bmp: unknown, _x: number, _y: number, w?: number, h?: number) => {
          if (w !== undefined && h !== undefined) drawn.push([w, h])
        },
        getImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4) }),
      } as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      callback(new Blob(['encoded'], { type: type ?? 'image/png' }))
    })
    const source = jpegFile()
    const result = await prepareImage(source)
    expect(result.blob).not.toBe(source)
    expect(result.blob.type).toBe('image/webp')
    // The resampling call runs last (after the 24px/32px sampling draws) and
    // caps the longest edge while keeping the aspect ratio.
    const resample = drawn.at(-1)!
    expect(resample[0]).toBe(RESAMPLE_EDGE)
    expect(resample[1]).toBeLessThanOrEqual(2000)
  })

  it('falls back to the raw source when decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode failed') }))
    const source = jpegFile()
    const result = await prepareImage(source)
    expect(result.blob).toBe(source)
    expect(result.imageDark).toBe(false)
    expect(result.accent).toBeNull()
  })
})
