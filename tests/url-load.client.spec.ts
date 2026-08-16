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
})

function stubFetch(init: () => Response | Promise<Response>): void {
  globalThis.fetch = vi.fn(init) as unknown as typeof fetch
}

/** A plain-object Response stand-in: jsdom's Response.blob() truncates
 * bodies above ~a few MB (known jsdom limitation), which would break the
 * size-gate tests. fetchBlob only touches ok/status and blob(). */
function stubFetchBlob(blob: Blob | null): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: blob !== null,
    status: blob === null ? 404 : 200,
    blob: async () => blob ?? new Blob(),
  })) as unknown as typeof fetch
}

function okResponse(body: Blob | string, type?: string): Response {
  return new Response(body, type === undefined ? { status: 200 } : { status: 200, headers: { 'Content-Type': type } })
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
    stubFetch(() => okResponse('hello', 'text/plain'))
    const blob = await fetchBlob('https://example.com/x')
    expect(await blob.text()).toBe('hello')
  })

  it('maps a non-2xx response to http', async () => {
    stubFetch(() => new Response('nope', { status: 404 }))
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'http' })
  })

  it('maps a rejected fetch to cors (cross-origin without CORS headers)', async () => {
    stubFetch(() => { throw new TypeError('Failed to fetch') })
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'cors' })
  })

  it('maps an empty body to network', async () => {
    stubFetch(() => okResponse(''))
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'network' })
  })
})

describe('loadImageFromUrl', () => {
  it('rejects non-image content types', async () => {
    stubFetch(() => okResponse(new Blob(['x'], { type: 'application/json' }), 'application/json'))
    await expect(loadImageFromUrl('https://example.com/x.jpg')).rejects.toMatchObject({ code: 'type' })
  })

  it('rejects oversized images before the pipeline', async () => {
    const big = new Blob([new Uint8Array(MAX_INPUT_BYTES + 1)], { type: 'image/png' })
    stubFetchBlob(big)
    await expect(loadImageFromUrl('https://example.com/x.png')).rejects.toMatchObject({ code: 'size' })
  })

  it('passes an image-sized blob into the compression pipeline', async () => {
    const small = new Blob([new Uint8Array(64)], { type: 'image/png' })
    stubFetch(() => okResponse(small, 'image/png'))
    const result = await loadImageFromUrl('https://example.com/x.png')
    expect(result.url.startsWith('data:')).toBe(true)
  })
})

describe('loadVideoFromUrl', () => {
  it('rejects non-video content types', async () => {
    stubFetch(() => okResponse(new Blob(['x'], { type: 'text/html' }), 'text/html'))
    await expect(loadVideoFromUrl('https://example.com/x.mp4')).rejects.toMatchObject({ code: 'type' })
  })

  it('rejects oversized videos', async () => {
    const big = new Blob([new Uint8Array(MAX_VIDEO_BYTES + 1)], { type: 'video/mp4' })
    stubFetchBlob(big)
    await expect(loadVideoFromUrl('https://example.com/x.mp4')).rejects.toMatchObject({ code: 'size' })
  })

  it('returns a File carrying the video type and a derived name', async () => {
    const small = new Blob([new Uint8Array(64)], { type: 'video/webm' })
    stubFetch(() => okResponse(small, 'video/webm'))
    const file = await loadVideoFromUrl('https://example.com/bg.webm')
    expect(file.type).toBe('video/webm')
    expect(file.name).toBe('bg.webm')
  })
})
