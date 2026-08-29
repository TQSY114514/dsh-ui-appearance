// @vitest-environment jsdom
/** DOM applier: element ownership, variable writes, override lifecycle, disposal. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import { AppearanceApplier, BG_LAYER_ID, STYLE_ID } from '../src/client/applier.ts'

// jsdom implements none of the media/blob URL surface the video path touches.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
})

// Controllable video-store: only the in-flight-dispose test drives a real
// pending load; every other test never reaches getVideo (empty key short-circuits).
const videoMock = vi.hoisted(() => ({
  getVideo: vi.fn<(key: string) => Promise<Blob | undefined>>(),
  resolveLoad: undefined as ((value: Blob | undefined) => void) | undefined,
}))
vi.mock('../src/client/video-store.ts', () => ({
  getVideo: (_key: string): Promise<Blob | undefined> =>
    new Promise(resolve => { videoMock.resolveLoad = resolve }),
}))

afterEach(() => {
  document.head.querySelectorAll(`#${STYLE_ID}`).forEach(node => node.remove())
  document.body.querySelectorAll(`#${BG_LAYER_ID}`).forEach(node => node.remove())
  vi.restoreAllMocks()
  videoMock.resolveLoad = undefined
})

/** Minimal ctx.theme double: records override layers and hands out disposers. */
function fakeCtx() {
  const remove = vi.fn()
  const overrideTokens = vi.fn(() => remove)
  const ctx = { theme: { overrideTokens } } as unknown as ConstructorParameters<typeof AppearanceApplier>[0]
  return { ctx, overrideTokens, remove }
}

const full = (partial: Partial<AppearanceSettings> = {}): AppearanceSettings => ({ ...DEFAULT_SETTINGS, ...partial })

describe('AppearanceApplier', () => {
  it('owns the stylesheet and background layer from construction', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
    expect(document.getElementById(BG_LAYER_ID)).not.toBeNull()
    applier.dispose()
  })

  it('apply with custom settings writes body variables and forwards token overrides', () => {
    const { ctx, overrideTokens, remove } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const settings = full({
      accent: '#4176e6', backgroundImage: 'data:image/png;base64,AAAA',
      backgroundOpacity: 0.5, backgroundBlur: 12, scrim: 0.4, glassBlur: 8,
    })
    applier.apply(settings)
    expect(overrideTokens).toHaveBeenCalledTimes(1)
    expect(overrideTokens).toHaveBeenCalledWith(
      '@deepseek-ai/dsh-client-ui-appearance',
      expect.any(Object),
    )
    const body = document.body
    expect(body.style.getPropertyValue('--dsw-appearance-bg-image')).toBe('url("data:image/png;base64,AAAA")')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-opacity')).toBe('0.5')
    // 毛玻璃 rides the same wallpaper-layer filter as 背景模糊 (summed).
    expect(body.style.getPropertyValue('--dsw-appearance-blur')).toBe('20px')
    // …and amplifies the host modal masks so covered content frosts too.
    expect(body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(8px)')
    expect(body.style.getPropertyValue('--dsw-appearance-scrim')).toBe('0.4')
    applier.dispose()
    expect(remove).toHaveBeenCalled()
  })

  it('apply with undefined settings applies the default white accent', () => {
    const { ctx, overrideTokens, remove } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ accent: '#4176e6' }))
    applier.apply(undefined)
    // undefined falls back to the defaults, which now carry the white accent,
    // so the override layer is rebuilt rather than retracted.
    expect(overrideTokens).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    applier.dispose()
  })

  it('apply with an image removal resets the background image variable', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ backgroundImage: 'data:image/png;base64,AAAA' }))
    applier.apply(full())
    expect(document.body.style.getPropertyValue('--dsw-appearance-bg-image')).toBe('none')
    applier.dispose()
  })

  it('glass 0 writes blur(0px) (no stock fallback); dispose removes the token', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ glassBlur: 20, backgroundBlur: 0 }))
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(20px)')
    applier.apply(full({ glassBlur: 0, backgroundBlur: 0 }))
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(0px)')
    applier.apply(full({ glassBlur: 6, backgroundBlur: 0 }))
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(6px)')
    applier.dispose()
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('')
  })

  it('dispose removes the elements, body variables, and the blur', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ backgroundBlur: 10, scrim: 0.5 }))
    expect(document.body.style.getPropertyValue('--dsw-appearance-blur')).toBe('10px')
    applier.dispose()
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.getElementById(BG_LAYER_ID)).toBeNull()
    expect(document.body.style.getPropertyValue('--dsw-appearance-blur')).toBe('')
    expect(document.body.style.getPropertyValue('--dsw-appearance-scrim')).toBe('')
  })

  it('dispose cancels an in-flight video load (no orphan element or URL)', async () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const layer = document.getElementById(BG_LAYER_ID)!
    applier.apply(full({ backgroundVideo: 'key-1' }))
    expect(videoMock.resolveLoad).toBeDefined()
    // Dispose while the IndexedDB read is still pending.
    applier.dispose()
    // The load settles afterwards: the stale key check must drop it.
    videoMock.resolveLoad!(new Blob(['x'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(layer.querySelector('video')).toBeNull()
    expect(layer.hasAttribute('data-video')).toBe(false)
  })

  it('a settled video load applies the layer before dispose', async () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const layer = document.getElementById(BG_LAYER_ID)!
    applier.apply(full({ backgroundVideo: 'key-2' }))
    videoMock.resolveLoad!(new Blob(['x'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(layer.hasAttribute('data-video')).toBe(true)
    applier.dispose()
    expect(layer.querySelector('video')).toBeNull()
  })

  it('portrait detection sets data-portrait on layer and dispose cleans it up', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const layer = document.getElementById(BG_LAYER_ID)!
    expect(layer.hasAttribute('data-portrait')).toBe(false)
    applier.dispose()
    expect(document.getElementById(BG_LAYER_ID)).toBeNull()
  })
})
