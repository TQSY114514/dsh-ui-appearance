// @vitest-environment jsdom
/** Remote URL loading: kind classification, fetch error mapping, size gates. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_INPUT_BYTES } from '../src/client/image.ts'
import { MAX_VIDEO_BYTES } from '../src/client/video-store.ts'
import {
  classifyUrl, fetchBlob, loadImageFromUrl, loadVideoFromUrl, UrlLoadFailure,
} from '../src/client/url-load.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.unstubAllGlobals()
})

function stubFetch(init: () => Response | Promise<Response>): void {
  globalThis.fetch = vi.fn(init) as unknown as typeof fetch
}

/** A plain-object Response stand-in: jsdom's Response.blob() truncates
 * bodies above ~a few MB and its Response constructor is unreliable across
 * Node/jsdom versions, which would break the size gates and the type gates.
 * fetchBlob only touches ok/status and blob(), so the shape is enough. */
function stubFetchBlob(blob: Blob | null): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: blob !== null,
    status: blob === null ? 404 : 200,
    blob: async () => blob ?? new Blob(),
  })) as unknown as typeof fetch
}

/** Same plain-object shape, for a non-2xx response. */
function stubFetchStatus(status: number): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob(['nope']),
  })) as unknown as typeof fetch
}

describe('classifyUrl', () => {
  it('recognizes video extensions', () => {
    for (const url of [
      'https://example.com/bg.mp4',
      'https://example.com/bg.webm?size=big',
      'https://example.com/a.ogg#frag',
      'https://example.com/bg.mov',
      'https://example.com/b.m4v',
    ]) {
      expect(classifyUrl(url)).toBe('video')
    }
  })

  it('defaults everything else to image', () => {
    for (const url of [
      'https://example.com/bg.jpg',
      'https://example.com/bg.png?x=1',
      'https://example.com/photo.webp',
      'https://example.com/random',
      'https://example.com/bg.mp4x', // not a clean extension boundary
    ]) {
      expect(classifyUrl(url)).toBe('image')
    }
  })
})

describe('fetchBlob', () => {
  it('returns the body blob on success', async () => {
    stubFetchBlob(new Blob(['hello'], { type: 'text/plain' }))
    const blob = await fetchBlob('https://example.com/x')
    expect(await blob.text()).toBe('hello')
  })

  it('maps a non-2xx response to http', async () => {
    stubFetchStatus(404)
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'http' })
  })

  it('maps a rejected fetch to cors (cross-origin without CORS headers)', async () => {
    stubFetch(() => { throw new TypeError('Failed to fetch') })
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'cors' })
  })

  it('maps an empty body to network', async () => {
    stubFetchBlob(new Blob([]))
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'network' })
  })
})

describe('loadImageFromUrl', () => {
  it('rejects non-image content types', async () => {
    stubFetchBlob(new Blob(['x'], { type: 'application/json' }))
    await expect(loadImageFromUrl('https://example.com/x.jpg')).rejects.toMatchObject({ code: 'type' })
  })

  it('rejects oversized images before the pipeline', async () => {
    const big = new Blob([new Uint8Array(MAX_INPUT_BYTES + 1)], { type: 'image/png' })
    stubFetchBlob(big)
    await expect(loadImageFromUrl('https://example.com/x.png')).rejects.toMatchObject({ code: 'size' })
  })

  it('prepares an in-bounds image for the store without re-encoding', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 50, close: vi.fn() })))
    const body = new Blob([new Uint8Array(64)], { type: 'image/png' })
    stubFetchBlob(body)
    const result = await loadImageFromUrl('https://example.com/x.png')
    // Within the edge bound the payload passes through untouched.
    expect(result.blob.type).toBe('image/png')
    expect(result.imageDark).toBe(false)
  })
})

describe('loadVideoFromUrl', () => {
  it('rejects non-video content types', async () => {
    stubFetchBlob(new Blob(['x'], { type: 'text/html' }))
    await expect(loadVideoFromUrl('https://example.com/x.mp4')).rejects.toMatchObject({ code: 'type' })
  })

  it('rejects oversized videos', async () => {
    const big = new Blob([new Uint8Array(MAX_VIDEO_BYTES + 1)], { type: 'video/mp4' })
    stubFetchBlob(big)
    await expect(loadVideoFromUrl('https://example.com/x.mp4')).rejects.toMatchObject({ code: 'size' })
  })

  it('returns a File carrying the video type and a derived name', async () => {
    stubFetchBlob(new Blob([new Uint8Array(64)], { type: 'video/webm' }))
    const file = await loadVideoFromUrl('https://example.com/bg.webm')
    expect(file.type).toBe('video/webm')
    expect(file.name).toBe('bg.webm')
  })
})
