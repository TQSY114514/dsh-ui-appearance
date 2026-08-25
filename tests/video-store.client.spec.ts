// @vitest-environment node
/** IndexedDB video store: save/get/delete with the size cap.
 * Node environment on purpose: records store Blobs by reference, and only
 * the global (undici) Blob survives fake-indexeddb's structured clone —
 * a jsdom Blob gets degraded to "[object Object]". Real Chromium handles
 * window Blobs natively, which this suite approximates via undici. */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteVideo, getVideo, MAX_VIDEO_BYTES, saveVideo } from '../src/client/video-store.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('video store', () => {
  it('round-trips a stored video by key', async () => {
    const blob = new Blob(['fake-video-bytes'], { type: 'video/mp4' })
    const key = await saveVideo(blob, 'demo.mp4')
    expect(key.length).toBeGreaterThan(0)
    const video = await getVideo(key)
    expect(video?.size).toBe(blob.size)
    expect(video?.type).toBe('video/mp4')
  })

  it('returns undefined for an unknown key', async () => {
    expect(await getVideo('nope')).toBeUndefined()
  })

  it('refuses videos above the size cap', async () => {
    const big = new Blob([new Uint8Array(MAX_VIDEO_BYTES + 1)], { type: 'video/mp4' })
    await expect(saveVideo(big, 'huge.mp4')).rejects.toThrow(/limit/)
  })

  it('deletes a stored video', async () => {
    const key = await saveVideo(new Blob(['x'], { type: 'video/webm' }), 'a.webm')
    await deleteVideo(key)
    expect(await getVideo(key)).toBeUndefined()
  })
})
