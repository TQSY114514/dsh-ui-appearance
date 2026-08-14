// @vitest-environment jsdom
/** Image reading: rejection, compression path, raw fallback. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_DIMENSION, readImageFile } from '../src/client/image.ts'

/** Fake 2d context (jsdom provides no canvas implementation). */
function fakeContext() {
  return { drawImage: vi.fn() }
}

/** Fake canvas: captures the requested size and reports the encode quality. */
function fakeCanvas() {
  const records: Array<{ width: number; height: number; quality?: number }> = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    records.push({ width: this.width, height: this.height })
    return fakeContext() as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    records.push({ width: this.width, height: this.height, ...(quality === undefined ? {} : { quality }) })
    callback(new Blob([type === 'image/png' ? 'png' : 'jpg'], type === undefined ? undefined : { type }))
  })
  return records
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

describe('readImageFile', () => {
  it('rejects non-image files', async () => {
    await expect(readImageFile(new File(['x'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow()
  })

  it('downscales to the dimension bound and returns a data URL', async () => {
    const records = fakeCanvas()
    const dataUrl = await readImageFile(jpegFile())
    expect(dataUrl).toMatch(/^data:/)
    // First record is the scaled canvas (longest edge capped at the bound).
    const scaled = records.find(record => record.width > 0)
    expect(scaled?.width).toBe(MAX_IMAGE_DIMENSION)
    expect(scaled?.height).toBe(Math.round(MAX_IMAGE_DIMENSION / 2))
  })

  it('re-encodes a second, smaller pass when the first result is oversized', async () => {
    const records: Array<{ width: number; height: number; quality?: number }> = []
    let call = 0
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      records.push({ width: this.width, height: this.height })
      return fakeContext() as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      records.push({ width: this.width, height: this.height, ...(quality === undefined ? {} : { quality }) })
      call += 1
      const size = call === 1 ? 3_000_000 : 10
      callback(new Blob([new Uint8Array(size)], type === undefined ? undefined : { type }))
    })
    const dataUrl = await readImageFile(jpegFile())
    expect(dataUrl).toMatch(/^data:/)
    const encodes = records.filter(record => record.quality !== undefined)
    expect(encodes).toHaveLength(2)
    expect(encodes[1]!.quality).toBe(0.6)
  })

  it('falls back to the raw file bytes when the canvas path fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const dataUrl = await readImageFile(jpegFile())
    expect(dataUrl.startsWith('data:image/jpeg')).toBe(true)
  })

  it('falls back to the raw file bytes when decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode failed') }))
    const dataUrl = await readImageFile(jpegFile())
    expect(dataUrl.startsWith('data:image/jpeg')).toBe(true)
  })
})
