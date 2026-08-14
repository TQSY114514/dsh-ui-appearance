// @vitest-environment jsdom
/** DOM applier: element ownership, variable writes, override lifecycle, disposal. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import { AppearanceApplier, BG_LAYER_ID, GLASS_CLASS, STYLE_ID } from '../src/client/applier.ts'

afterEach(() => {
  document.head.querySelectorAll(`#${STYLE_ID}`).forEach(node => node.remove())
  document.body.querySelectorAll(`#${BG_LAYER_ID}`).forEach(node => node.remove())
  vi.restoreAllMocks()
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
      backgroundOpacity: 0.5, backgroundBlur: 12, glassBlur: 8,
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
    expect(body.style.getPropertyValue('--dsw-appearance-bg-blur')).toBe('12px')
    expect(body.style.getPropertyValue('--dsw-appearance-glass-blur')).toBe('8px')
    expect(body.classList.contains(GLASS_CLASS)).toBe(true)
    applier.dispose()
    expect(remove).toHaveBeenCalled()
  })

  it('apply with stock settings retracts the previous override layer', () => {
    const { ctx, overrideTokens, remove } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ accent: '#4176e6' }))
    applier.apply(undefined)
    expect(overrideTokens).toHaveBeenCalledTimes(1)
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

  it('dispose removes the elements, body variables, and the glass class', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ glassBlur: 10 }))
    expect(document.body.classList.contains(GLASS_CLASS)).toBe(true)
    applier.dispose()
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.getElementById(BG_LAYER_ID)).toBeNull()
    expect(document.body.classList.contains(GLASS_CLASS)).toBe(false)
    expect(document.body.style.getPropertyValue('--dsw-appearance-bg-blur')).toBe('')
  })
})
