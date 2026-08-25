// @vitest-environment node
/** Image blob store: save/get/delete round-trips against fake-indexeddb.
 * Node environment on purpose: fake-indexeddb cannot structured-clone a jsdom
 * Blob (it degrades to the 15-byte "[object Object]" and drops the type),
 * while Node's global undici Blob clones correctly — same trade-off as
 * video-store.client.spec.ts. Production Chromium clones either natively. */
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteImage, getImage, saveImage } from '../src/client/image-store.ts'

describe('image store', () => {
  it('round-trips a saved blob through its generated key', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    const key = await saveImage(blob, 'photo.png')
    expect(key).not.toBe('')
    const stored = await getImage(key)
    expect(stored).toBeDefined()
    expect(stored!.type).toBe('image/png')
    expect(await stored!.text()).toBe('hello')
  })

  it('resolves undefined for an unknown key', async () => {
    await expect(getImage('missing-key')).resolves.toBeUndefined()
  })

  it('deletes a record so the key stops resolving', async () => {
    const key = await saveImage(new Blob(['x'], { type: 'image/jpeg' }), 'a.jpg')
    await deleteImage(key)
    await expect(getImage(key)).resolves.toBeUndefined()
  })
})
