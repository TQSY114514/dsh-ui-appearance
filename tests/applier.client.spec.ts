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
  document.head.querySelectorAll(`#${STYLE_ID}`).forEach(node => { node.remove() })
  document.body.querySelectorAll(`#${BG_LAYER_ID}`).forEach(node => { node.remove() })
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
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-light')).toBe('#ffffff')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-dark')).toBe('#151517')
    // 背景模糊 controls only the background wallpaper/video layer; 毛玻璃 frosts UI components.
    expect(body.style.getPropertyValue('--dsw-appearance-blur')).toBe('12px')
    expect(body.style.getPropertyValue('--dsw-appearance-glass-filter')).toBe('blur(8px) saturate(150%)')
    // Modal masks follow glassBlur while open; closing the modal leaves the background clear.
    expect(body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(8px)')
    expect(body.style.getPropertyValue('--dsw-appearance-scrim')).toBe('0.4')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-light')).toBe('#ffffff')
    applier.dispose()
    expect(remove).toHaveBeenCalled()
  })

  it('writes modal variables for dialogs and settings panels and cleans them up on dispose', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    // Default modalAlpha is 1 (fully opaque hex for readability - Issue #37)
    applier.apply(full({ modalAlpha: 1 }))
    const body = document.body
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-light')).toBe('#ffffff')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-dark')).toBe('#2c2c2e')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-nav-active-light')).toBe('#ebeef2')

    // modalAlpha below 1 bakes translucent rgba
    applier.apply(full({ modalAlpha: 0.8 }))
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-light')).toBe('rgba(255, 255, 255, 0.8)')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-dark')).toBe('rgba(44, 44, 46, 0.8)')

    applier.dispose()
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-light')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-dark')).toBe('')
  })

  it('isolates modal panel variables per mode without leaking light/legacy panel or dark.background (Issue #38)', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body

    // 1. Customizing light.panel (even with legacy `panel` populated) must NOT leak into dark modal variables
    applier.apply(full({
      panel: '#f4f1ea',
      light: { ...DEFAULT_SETTINGS.light, panel: '#f4f1ea' },
      dark: { ...DEFAULT_SETTINGS.dark, panel: '' },
    }))
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l1-light')).toBe('#f4f1ea')
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-dark')).toBe('#2c2c2e')

    // 2. Customizing dark.background without dark.panel must keep stock dark modal layer-2 (#2c2c2e)
    applier.apply(full({
      dark: { ...DEFAULT_SETTINGS.dark, background: '#0b0f19', panel: '' },
    }))
    expect(body.style.getPropertyValue('--dsw-appearance-modal-l2-dark')).toBe('#2c2c2e')

    applier.dispose()
  })

  it('uses specificity-free :where(#root, body) for light modals and avoids matching child panel/dialog elements (Issue #38)', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''

    // Light modal ancestor scope must use :where(#root, body) so dark mode wins
    expect(css).toContain(':where(#root, body) :is(')
    expect(css).not.toContain('[data-shortcut-modal="settings"] [class*="panel" i]')
    expect(css).not.toContain('[class*="dialog" i]')

    // Verify DOM matching: settings modal root matches, but inner .schemePanel or .dialogBody does not
    const overlay = document.createElement('div')
    overlay.className = 'VOzbGW_overlay'
    const dialog = document.createElement('div')
    dialog.setAttribute('data-shortcut-modal', 'settings')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.className = 'VOzbGW_panel'
    const innerSchemePanel = document.createElement('div')
    innerSchemePanel.className = '_schemePanel_12345'
    const innerDialogBody = document.createElement('div')
    innerDialogBody.className = 'abc_dialogBody'
    dialog.append(innerSchemePanel, innerDialogBody)
    overlay.append(dialog)
    document.body.append(overlay)

    const modalSelector = ':where(#root, body) :is([role="dialog"], [aria-modal="true"], [data-shortcut-modal="settings"], [class$="_dialog"], [class*="_dialog "]):not([class*="overlay" i]):not([class*="mask" i])'
    expect(dialog.matches(modalSelector)).toBe(true)
    expect(overlay.matches(modalSelector)).toBe(false)
    expect(innerSchemePanel.matches(modalSelector)).toBe(false)
    expect(innerDialogBody.matches(modalSelector)).toBe(false)

    overlay.remove()
    applier.dispose()
  })

  it('gates light bubble-ink rule out of dark mode so disabling dark bubble fallback never falls back to light ink', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('html:not([data-ds-dark-theme]):not([data-theme="dark"]) body[data-dsw-bubble-ink-light]:not([data-ds-dark-theme]):not([data-theme="dark"])')
    applier.dispose()
  })

  it('arms the bubble-ink gate per mode only when contrast drops below 3.5:1 and retracts when readable or disposed', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body

    // Default stock settings already have >= 3.5:1 bubble contrast in both modes.
    applier.apply(full())
    expect(body.hasAttribute('data-dsw-bubble-ink-light')).toBe(false)
    expect(body.hasAttribute('data-dsw-bubble-ink-dark')).toBe(false)

    // Dark panel in both modes: light mode needs light ink fallback, dark mode is already readable.
    applier.apply(full({ panel: '#111111' }))
    expect(body.hasAttribute('data-dsw-bubble-ink-light')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-light')).toBe('#fafaf9')
    expect(body.hasAttribute('data-dsw-bubble-ink-dark')).toBe(false)

    // Dark panel in light mode + bright panel in dark mode arms both gates independently.
    applier.apply(full({
      light: { ...DEFAULT_SETTINGS.light, panel: '#111111' },
      dark: { ...DEFAULT_SETTINGS.dark, panel: '#ffffff' },
    }))
    expect(body.hasAttribute('data-dsw-bubble-ink-light')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-light')).toBe('#fafaf9')
    expect(body.hasAttribute('data-dsw-bubble-ink-dark')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-dark')).toBe('#0f1115')

    // Restoring light panel to white retracts light gate while keeping dark gate armed.
    applier.apply(full({
      light: { ...DEFAULT_SETTINGS.light, panel: '#ffffff' },
      dark: { ...DEFAULT_SETTINGS.dark, panel: '#ffffff' },
    }))
    expect(body.hasAttribute('data-dsw-bubble-ink-light')).toBe(false)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-light')).toBe('')
    expect(body.hasAttribute('data-dsw-bubble-ink-dark')).toBe(true)

    applier.dispose()
    expect(body.hasAttribute('data-dsw-bubble-ink-light')).toBe(false)
    expect(body.hasAttribute('data-dsw-bubble-ink-dark')).toBe(false)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-dark')).toBe('')
  })

  it('apply with undefined settings falls back to stock defaults', () => {
    const { ctx, overrideTokens, remove } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ accent: '#4176e6' }))
    applier.apply(undefined)
    // undefined falls back to DEFAULT_SETTINGS, which still emits opaque
    // input/code/menu/hover tokens and removes the custom accent attributes.
    expect(overrideTokens).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(document.body.hasAttribute('data-dsw-accent-ink-light')).toBe(false)
    applier.dispose()
  })

  it('sets and retracts per-mode accent ink attributes and variables and scopes foreground only to accent surfaces', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body
    const html = document.documentElement

    // Stock defaults leave accent-ink attributes unset.
    applier.apply(full())
    expect(body.hasAttribute('data-dsw-accent-ink-light')).toBe(false)
    expect(body.hasAttribute('data-dsw-accent-ink-dark')).toBe(false)
    expect(body.style.getPropertyValue('--dsw-appearance-accent-ink-light')).toBe('')

    // Custom per-mode accents arm accent-ink per mode with contrasting ink.
    applier.apply(full({
      light: { ...DEFAULT_SETTINGS.light, accent: '#ffffff' },
      dark: { ...DEFAULT_SETTINGS.dark, accent: '#4176e6' },
    }))
    expect(body.hasAttribute('data-dsw-accent-ink-light')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-accent-ink-light')).toBe('#0f1115')
    expect(body.hasAttribute('data-dsw-accent-ink-dark')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-accent-ink-dark')).toBe('#fafaf9')

    // Verify DOM selector matching: accent controls match across #root and body portals;
    // QuestionComposer checkboxes, step dots, and danger buttons do NOT match.
    const root = document.createElement('div')
    root.id = 'root'
    const primaryBtn = document.createElement('button')
    primaryBtn.className = '_button_1ulci_2 _primary_1ulci_36'
    const dangerBtn = document.createElement('button')
    dangerBtn.className = '_button_1ulci_2 _primary_1ulci_36 X_2TxG_dangerButton'
    const primaryLink = document.createElement('a')
    primaryLink.className = 'abc_primary'
    const switchOn = document.createElement('button')
    switchOn.setAttribute('role', 'switch')
    switchOn.setAttribute('aria-checked', 'true')
    const switchOff = document.createElement('button')
    switchOff.setAttribute('role', 'switch')
    switchOff.setAttribute('aria-checked', 'false')
    const onbLabel = document.createElement('label')
    const onbInput = document.createElement('input')
    onbInput.type = 'checkbox'
    onbInput.checked = true
    const onbIndicator = document.createElement('span')
    onbIndicator.className = 'ywGceq_indicator'
    onbLabel.append(onbInput, onbIndicator)
    const accentBadge = document.createElement('span')
    accentBadge.setAttribute('data-dsw-accent-surface', '')
    const questionCheckbox = document.createElement('span')
    questionCheckbox.className = 'Mbwy4a_checkbox Mbwy4a_checkboxChecked'
    const stepIndicator = document.createElement('span')
    stepIndicator.className = '_step_1i3xo_97'
    stepIndicator.setAttribute('data-state', 'done')
    root.append(primaryBtn, dangerBtn, primaryLink, switchOn, switchOff, onbLabel, accentBadge, questionCheckbox, stepIndicator)

    const portal = document.createElement('div')
    const chipActive = document.createElement('button')
    chipActive.className = '_6_jNJa_chip _6_jNJa_chipActive'
    portal.append(chipActive)
    body.append(root, portal)

    try {
      const lightSelector = 'html:not([data-ds-dark-theme]):not([data-theme="dark"]) body[data-dsw-accent-ink-light]:not([data-ds-dark-theme]):not([data-theme="dark"]) :is(button:is([class*="_primary"]:not([class*="danger" i]), [class*="_chipActive"]), a[class*="_primary"], [role="switch"][aria-checked="true"], input:checked + [class*="_indicator"], [data-dsw-accent-surface])'
      const darkSelector = ':is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-accent-ink-dark] :is(button:is([class*="_primary"]:not([class*="danger" i]), [class*="_chipActive"]), a[class*="_primary"], [role="switch"][aria-checked="true"], input:checked + [class*="_indicator"], [data-dsw-accent-surface])'
      const css = document.getElementById(STYLE_ID)?.textContent ?? ''
      expect(css).toContain('body[data-dsw-accent-ink-light]:not([data-ds-dark-theme]):not([data-theme="dark"]) :is(')
      expect(css).toContain('body[data-dsw-accent-ink-dark] :is(')

      expect(primaryBtn.matches(lightSelector)).toBe(true)
      expect(chipActive.matches(lightSelector)).toBe(true)
      expect(primaryLink.matches(lightSelector)).toBe(true)
      expect(switchOn.matches(lightSelector)).toBe(true)
      expect(onbIndicator.matches(lightSelector)).toBe(true)
      expect(accentBadge.matches(lightSelector)).toBe(true)
      expect(dangerBtn.matches(lightSelector)).toBe(false)
      expect(switchOff.matches(lightSelector)).toBe(false)
      expect(questionCheckbox.matches(lightSelector)).toBe(false)
      expect(stepIndicator.matches(lightSelector)).toBe(false)

      // Switching host to dark theme switches matching cleanly from light rule to dark rule.
      html.setAttribute('data-ds-dark-theme', '')
      expect(primaryBtn.matches(lightSelector)).toBe(false)
      expect(primaryBtn.matches(darkSelector)).toBe(true)
      expect(chipActive.matches(darkSelector)).toBe(true)
      expect(questionCheckbox.matches(darkSelector)).toBe(false)
      expect(stepIndicator.matches(darkSelector)).toBe(false)
      expect(dangerBtn.matches(darkSelector)).toBe(false)
      html.removeAttribute('data-ds-dark-theme')

      // Clearing light accent retracts light attribute while preserving dark.
      applier.apply(full({
        light: { ...DEFAULT_SETTINGS.light, accent: '' },
        dark: { ...DEFAULT_SETTINGS.dark, accent: '#4176e6' },
      }))
      expect(body.hasAttribute('data-dsw-accent-ink-light')).toBe(false)
      expect(body.style.getPropertyValue('--dsw-appearance-accent-ink-light')).toBe('')
      expect(body.hasAttribute('data-dsw-accent-ink-dark')).toBe(true)

      applier.dispose()
      expect(body.hasAttribute('data-dsw-accent-ink-dark')).toBe(false)
      expect(body.style.getPropertyValue('--dsw-appearance-accent-ink-dark')).toBe('')
    } finally {
      html.removeAttribute('data-ds-dark-theme')
      root.remove()
      portal.remove()
      applier.dispose()
    }
  })

  it('scopes translucent input button tokens to the composer card only when inputAlpha < 1', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body
    const html = document.documentElement

    // Full inputAlpha (1): attribute and variables stay unset.
    applier.apply(full({ surfaceAlpha: 0, inputAlpha: 1 }))
    expect(body.hasAttribute('data-dsw-translucent-input')).toBe(false)
    expect(body.style.getPropertyValue('--dsw-appearance-composer-info-fill-light')).toBe('')

    // inputAlpha < 1: arms attribute and writes per-mode rgba composer variables.
    applier.apply(full({ inputAlpha: 0.25 }))
    expect(body.hasAttribute('data-dsw-translucent-input')).toBe(true)
    expect(body.style.getPropertyValue('--dsw-appearance-composer-info-fill-light')).toBe('rgba(65, 118, 230, 0.25)')
    expect(body.style.getPropertyValue('--dsw-appearance-composer-info-fill-dark')).toBe('rgba(122, 170, 255, 0.25)')
    expect(body.style.getPropertyValue('--dsw-appearance-composer-primary-fill-light')).toBe('rgba(15, 17, 21, 0.25)')
    expect(body.style.getPropertyValue('--dsw-appearance-composer-primary-fill-dark')).toBe('rgba(249, 250, 251, 0.25)')

    // DOM selector matching: matches InputBar [data-composer-card], NOT QuestionComposer .Mbwy4a_card
    const root = document.createElement('div')
    root.id = 'root'
    const composerCard = document.createElement('div')
    composerCard.setAttribute('data-composer-card', '')
    const questionCard = document.createElement('div')
    questionCard.className = 'Mbwy4a_card'
    const questionInput = document.createElement('textarea')
    questionInput.className = 'Mbwy4a_fieldInput'
    const questionBadge = document.createElement('span')
    questionBadge.className = 'Mbwy4a_badge'
    questionCard.append(questionInput, questionBadge)
    root.append(composerCard, questionCard)
    body.append(root)

    try {
      const lightComposerSel = 'html:not([data-ds-dark-theme]):not([data-theme="dark"]) body[data-dsw-translucent-input]:not([data-ds-dark-theme]):not([data-theme="dark"]) :is([data-composer-card], [class*="_card"]:has([class*="_input"]))'
      const darkComposerSel = ':is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-translucent-input] :is([data-composer-card], [class*="_card"]:has([class*="_input"]))'

      expect(composerCard.matches(lightComposerSel)).toBe(true)
      expect(questionCard.matches(lightComposerSel)).toBe(false)

      html.setAttribute('data-ds-dark-theme', '')
      expect(composerCard.matches(lightComposerSel)).toBe(false)
      expect(composerCard.matches(darkComposerSel)).toBe(true)
      expect(questionCard.matches(darkComposerSel)).toBe(false)
      html.removeAttribute('data-ds-dark-theme')

      // Restoring inputAlpha = 1 retracts attribute and variables.
      applier.apply(full({ inputAlpha: 1 }))
      expect(body.hasAttribute('data-dsw-translucent-input')).toBe(false)
      expect(body.style.getPropertyValue('--dsw-appearance-composer-info-fill-light')).toBe('')

      // Dispose also cleans up.
      applier.apply(full({ inputAlpha: 0.4 }))
      expect(body.hasAttribute('data-dsw-translucent-input')).toBe(true)
      applier.dispose()
      expect(body.hasAttribute('data-dsw-translucent-input')).toBe(false)
      expect(body.style.getPropertyValue('--dsw-appearance-composer-info-fill-dark')).toBe('')
    } finally {
      html.removeAttribute('data-ds-dark-theme')
      root.remove()
      applier.dispose()
    }
  })

  it('apply with an image removal resets the background image variable', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ backgroundImage: 'data:image/png;base64,AAAA' }))
    applier.apply(full())
    expect(document.body.style.getPropertyValue('--dsw-appearance-bg-image')).toBe('none')
    applier.dispose()
  })

  it('decouples glassBlur (component & modal mask frosting) from backgroundBlur; dispose removes tokens', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full({ glassBlur: 20, backgroundBlur: 0 }))
    expect(document.body.style.getPropertyValue('--dsw-appearance-blur')).toBe('0px')
    expect(document.body.style.getPropertyValue('--dsw-appearance-glass-filter')).toBe('blur(20px) saturate(150%)')
    expect(document.body.style.getPropertyValue('--dsw-menu-backdrop-filter')).toBe('blur(20px) saturate(150%)')
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(20px)')

    applier.apply(full({ glassBlur: 0, backgroundBlur: 14 }))
    expect(document.body.style.getPropertyValue('--dsw-appearance-blur')).toBe('14px')
    expect(document.body.style.getPropertyValue('--dsw-appearance-glass-filter')).toBe('none')
    expect(document.body.style.getPropertyValue('--dsw-menu-backdrop-filter')).toBe('none')
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(0px)')

    applier.apply(full({ glassBlur: 6, backgroundBlur: 10 }))
    expect(document.body.style.getPropertyValue('--dsw-appearance-blur')).toBe('10px')
    expect(document.body.style.getPropertyValue('--dsw-appearance-glass-filter')).toBe('blur(6px) saturate(150%)')
    expect(document.body.style.getPropertyValue('--dsw-menu-backdrop-filter')).toBe('blur(6px) saturate(150%)')
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('blur(6px)')

    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('backdrop-filter: var(--dsw-appearance-glass-filter, none)')
    expect(css).toContain('::before')
    expect(css).toContain('> [data-slot] > *')
    expect(css).toContain(':is([data-composer-card], [class*="_card"]:has([class*="_input"]))::before')
    expect(css).toContain('> :not([data-composer-overlay]):not([data-slot])')
    expect(css).toContain('[data-menu-material] > [class*="_backing"]')

    applier.dispose()
    expect(document.body.style.getPropertyValue('--dsw-appearance-glass-filter')).toBe('')
    expect(document.body.style.getPropertyValue('--dsw-mask-blur')).toBe('')
    expect(document.body.style.getPropertyValue('--dsw-menu-backdrop-filter')).toBe('')
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

  it('reports a video that fails to decode and clears the layer', async () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const onVideoPlaybackError = vi.fn()
    applier.onVideoPlaybackError = onVideoPlaybackError
    const layer = document.getElementById(BG_LAYER_ID)!
    applier.apply(full({ backgroundVideo: 'key-3' }))
    videoMock.resolveLoad!(new Blob(['x'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(layer.hasAttribute('data-video')).toBe(true)
    expect(onVideoPlaybackError).not.toHaveBeenCalled()

    // The browser rejects the codec: the layer drops and the row is told.
    layer.querySelector('video')!.onerror!(new Event('error'))
    expect(onVideoPlaybackError).toHaveBeenCalledTimes(1)
    expect(onVideoPlaybackError).toHaveBeenCalledWith(true)
    expect(layer.hasAttribute('data-video')).toBe(false)
    applier.dispose()
  })

  it('clears the decode failure once a video decodes, and on removal', async () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const onVideoPlaybackError = vi.fn()
    applier.onVideoPlaybackError = onVideoPlaybackError
    const layer = document.getElementById(BG_LAYER_ID)!
    applier.apply(full({ backgroundVideo: 'key-4' }))
    videoMock.resolveLoad!(new Blob(['x'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    layer.querySelector('video')!.onerror!(new Event('error'))
    expect(onVideoPlaybackError).toHaveBeenLastCalledWith(true)

    // Swapping in a playable video recovers: decoding started, so clear it.
    applier.apply(full({ backgroundVideo: 'key-5' }))
    videoMock.resolveLoad!(new Blob(['y'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    layer.querySelector('video')!.onloadeddata!(new Event('loadeddata'))
    expect(onVideoPlaybackError).toHaveBeenLastCalledWith(false)

    // Removing the video reports the same, and never repeats a state.
    const calls = onVideoPlaybackError.mock.calls.length
    applier.apply(full())
    expect(onVideoPlaybackError.mock.calls.length).toBe(calls)
    applier.dispose()
  })

  it('clears the decode failure when a broken video is removed directly', async () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const onVideoPlaybackError = vi.fn()
    applier.onVideoPlaybackError = onVideoPlaybackError
    const layer = document.getElementById(BG_LAYER_ID)!
    applier.apply(full({ backgroundVideo: 'key-fail' }))
    videoMock.resolveLoad!(new Blob(['x'], { type: 'video/mp4' }))
    await new Promise(resolve => { setTimeout(resolve, 0) })
    layer.querySelector('video')!.onerror!(new Event('error'))
    expect(onVideoPlaybackError).toHaveBeenLastCalledWith(true)

    // Removing the video directly must notify false so the row clears the warning.
    applier.apply(full({ backgroundVideo: '' }))
    expect(onVideoPlaybackError).toHaveBeenLastCalledWith(false)
    applier.dispose()
  })

  it('scopes business/brand primary tokens, paired foregrounds, selection styles, and excludes tooltips inside user bubbles (Issue #27, #46)', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    applier.apply(full())
    const body = document.body
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''

    // Issue #27: inline refChip legibility inside user bubbles
    expect(css).toContain('--dsw-alias-state-business-primary: var(--dsw-alias-label-primary)')
    expect(css).toContain('--dsw-alias-state-business-primary: var(--dsw-appearance-bubble-ink-light)')
    expect(css).toContain('--dsw-alias-state-business-primary: var(--dsw-appearance-bubble-ink-dark)')
    expect(css).toContain('[class*="refChip"]')

    // Issue #46: bubble-scoped `-foreground` always contrasts with bubble-scoped `brand-primary`
    expect(css).toContain('--dsw-alias-label-primary-foreground: var(--dsw-alias-label-primary-inverted)')
    expect(css).toContain('--dsw-alias-label-primary-foreground: var(--dsw-appearance-bubble-ink-fg-light)')
    expect(css).toContain('--dsw-alias-label-primary-foreground: var(--dsw-appearance-bubble-ink-fg-dark)')
    // Default bubbles are already readable -> bubble-ink fallback is inactive.
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-light')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-dark')).toBe('')

    // Dedicated global and bubble `::selection` variables (never `#fafaf9` on `#fafaf9`)
    expect(css).toContain('--dsw-appearance-selection-bg-dark')
    expect(css).toContain('--dsw-appearance-bubble-selection-bg-dark')
    expect(css).toContain('--dsw-appearance-bubble-selection-fg-dark')
    expect(body.style.getPropertyValue('--dsw-appearance-selection-bg-dark')).toBe('#4176e6')
    expect(body.style.getPropertyValue('--dsw-appearance-selection-fg-dark')).toBe('#fafaf9')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-bg-dark')).toBe('#4176e6')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-fg-dark')).toBe('#fafaf9')

    // Clashing surfaces arm bubble-ink-fg per mode
    applier.apply(full({
      light: { ...DEFAULT_SETTINGS.light, panel: '#111111' },
      dark: { ...DEFAULT_SETTINGS.dark, panel: '#ffffff' },
    }))
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-light')).toBe('#fafaf9')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-fg-light')).toBe('#0f1115')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-dark')).toBe('#0f1115')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-fg-dark')).toBe('#fafaf9')

    // Same-hue blue bubble falls back to contrasting `#fafaf9` bg + `#0f1115` fg
    applier.apply(full({
      dark: { ...DEFAULT_SETTINGS.dark, accent: '#4176e6', panel: '#355eb6' },
    }))
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-bg-dark')).toBe('#fafaf9')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-fg-dark')).toBe('#0f1115')
    // Dark text on #355eb6 is not dark-mode readable? (#fafaf9 on #355eb6 > 3.5, so bubble-ink-dark clears)
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-fg-dark')).toBe('')

    // Tooltip bubbles carrying [data-side] or [data-portal] must NOT match user bubble rules
    const root = document.createElement('div')
    root.id = 'root'
    const userBubble = document.createElement('div')
    userBubble.className = '_bubble_1sgyj_1'
    const tooltipWithSide = document.createElement('div')
    tooltipWithSide.className = '_bubble_gm1ra_1'
    tooltipWithSide.setAttribute('data-side', 'top')
    const tooltipWithPortal = document.createElement('div')
    tooltipWithPortal.className = '_bubble_gm1ra_1'
    tooltipWithPortal.setAttribute('data-portal', '')
    root.append(userBubble, tooltipWithSide, tooltipWithPortal)
    body.append(root)
    try {
      const bubbleSelector = '#root :is([class*="_bubble"], [class*="bubble" i]):not([data-side]):not([data-portal])'
      expect(userBubble.matches(bubbleSelector)).toBe(true)
      expect(tooltipWithSide.matches(bubbleSelector)).toBe(false)
      expect(tooltipWithPortal.matches(bubbleSelector)).toBe(false)
    } finally {
      root.remove()
    }

    applier.dispose()
    expect(body.style.getPropertyValue('--dsw-appearance-selection-bg-dark')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-selection-fg-dark')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-bg-dark')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-selection-fg-dark')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-bubble-ink-fg-light')).toBe('')
  })

  it('enforces inverted label ink on solid tags so Agent Presets default tag stays readable', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain("[data-tone='solid']")
    expect(css).toContain('color: var(--dsw-alias-label-primary-inverted) !important')
    applier.dispose()
  })

  it('remaps deliverables and changed-files tokens to follow surfaceAlpha translucency', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('--changes-fill: var(--dsw-alias-bg-module-platform) !important')
    expect(css).toContain('--changes-hover: var(--dsw-alias-interactive-bg-hover-solid) !important')
    expect(css).toContain('--deliverable-fill: var(--dsw-alias-bg-module-platform) !important')
    expect(css).toContain('--deliverable-hover: var(--dsw-alias-interactive-bg-hover-solid) !important')
    applier.dispose()
  })

  it('remaps menu surface fill and scopes popover layer/fill/hover tokens to popoverAlpha', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('[data-menu-material]')
    expect(css).toContain('[data-menu-backing]')
    expect(css).toContain('--dsw-menu-surface-fill: var(--dsw-specific-menu) !important')
    expect(css).toContain('--dsw-alias-interactive-bg-hover: var(--dsw-appearance-popover-hover-light)')
    expect(css).toContain('--dsw-alias-interactive-bg-hover: var(--dsw-appearance-popover-hover-dark)')
    expect(css).toContain('--dsw-alias-fill-l1: var(--dsw-appearance-popover-mod-light)')
    expect(css).toContain('--dsw-alias-fill-l1: var(--dsw-appearance-popover-mod-dark)')

    // Default popoverAlpha = 1 keeps menu inner layers/hovers opaque even when surfaceAlpha = 0
    applier.apply(full({ surfaceAlpha: 0, popoverAlpha: 1 }))
    expect(body.style.getPropertyValue('--dsw-appearance-popover-l1-light')).toBe('#ffffff')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-l3-dark')).toBe('#353638')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-hover-light')).toBe('#f1f3f5')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-hover-dark')).toBe('#43454a')

    // Lowering popoverAlpha bakes translucent rgba values
    applier.apply(full({ surfaceAlpha: 1, popoverAlpha: 0.7 }))
    expect(body.style.getPropertyValue('--dsw-appearance-popover-l1-light')).toBe('rgba(255, 255, 255, 0.7)')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-l3-dark')).toBe('rgba(53, 54, 56, 0.7)')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-hover-light')).toBe('rgba(241, 243, 245, 0.7)')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-hover-dark')).toBe('rgba(67, 69, 74, 0.7)')

    // Verify popover selector matches menu/popover containers without matching sidebar trigger buttons (.hHd-Xa_moreMenu)
    const menuEl = document.createElement('div')
    menuEl.setAttribute('data-menu-material', '')
    const slashMenuEl = document.createElement('div')
    slashMenuEl.setAttribute('data-trigger-menu', '')
    slashMenuEl.className = '_3e4SsG_menu'
    const sidebarMoreBtn = document.createElement('button')
    sidebarMoreBtn.className = 'hHd-Xa_moreMenu'
    document.body.append(menuEl, slashMenuEl, sidebarMoreBtn)

    const popoverSelector = ':where(#root, body) :is([data-menu-material], [data-trigger-menu], [role="menu"], [role="listbox"], [class$="_menu"], [class*="_menu "], [class*="_menu_"], [class*="_submenu"], [class*="popover" i])'
    expect(menuEl.matches(popoverSelector)).toBe(true)
    expect(slashMenuEl.matches(popoverSelector)).toBe(true)
    expect(sidebarMoreBtn.matches(popoverSelector)).toBe(false)

    menuEl.remove()
    slashMenuEl.remove()
    sidebarMoreBtn.remove()
    applier.dispose()
    expect(body.style.getPropertyValue('--dsw-appearance-popover-l1-light')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-popover-hover-dark')).toBe('')
  })

  it('remaps interactive hover and active tab tokens inside sidebar to sidebar nav active/hover tokens', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain(':is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i])')
    expect(css).toContain('--dsw-alias-interactive-bg-hover: var(--dsw-specific-sidebar-nav-item-active)')
    expect(css).toContain('--dsw-alias-interactive-bg-active: var(--dsw-specific-sidebar-nav-item-active)')
    expect(css).toContain('--dsw-alias-markdown-tag: var(--dsw-specific-sidebar-nav-item-active)')
    expect(css).toContain('--dsw-alias-interactive-bg-hover: var(--dsw-specific-sidebar-nav-item-hover)')
    expect(css).toContain(':where(#root, body) :is([class*="_tabActive"], [class*="tabActive" i]):hover')
    expect(css).toContain('--dsw-alias-interactive-bg-hover: var(--dsw-alias-interactive-bg-active)')

    // Dark wallpaper + translucent modalAlpha never writes NaN into modal nav variables
    applier.apply(full({
      backgroundImage: 'data:image/png;base64,AAAA',
      imageDark: true,
      modalAlpha: 0.5,
    }))
    expect(document.body.style.getPropertyValue('--dsw-appearance-modal-nav-active-light')).toBe('rgba(67, 69, 74, 0.5)')
    expect(document.body.style.getPropertyValue('--dsw-appearance-modal-nav-hover-light')).toBe('rgba(53, 54, 56, 0.5)')
    applier.dispose()
  })

  it('punches out Windows desktop host frame when background media is active (Issue #31)', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('html[data-dsw-has-bg][data-windows-titlebar] [class*="_frame"]')
    expect(css).toContain('background: transparent !important')

    // No media by default: data-dsw-has-bg must NOT be set
    applier.apply(full({ backgroundImage: '', backgroundVideo: '' }))
    expect(document.documentElement.hasAttribute('data-dsw-has-bg')).toBe(false)

    // With wallpaper: data-dsw-has-bg is set
    applier.apply(full({ backgroundImage: 'data:image/png;base64,AAAA' }))
    expect(document.documentElement.hasAttribute('data-dsw-has-bg')).toBe(true)

    // Clear media: attribute is removed
    applier.apply(full({ backgroundImage: '', backgroundVideo: '' }))
    expect(document.documentElement.hasAttribute('data-dsw-has-bg')).toBe(false)

    // With video: data-dsw-has-bg is set
    applier.apply(full({ backgroundVideo: 'some-video' }))
    expect(document.documentElement.hasAttribute('data-dsw-has-bg')).toBe(true)

    // Disposal removes attribute
    applier.dispose()
    expect(document.documentElement.hasAttribute('data-dsw-has-bg')).toBe(false)
  })

  it('manages 3-layer background base colors and fallbacks', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body

    // 1. Explicit background colors in light/dark palettes
    applier.apply(full({
      light: { ...DEFAULT_SETTINGS.light, background: '#f0f4f8' },
      dark: { ...DEFAULT_SETTINGS.dark, background: '#12161a' },
    }))
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-light')).toBe('#f0f4f8')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-dark')).toBe('#12161a')

    // 2. Default background fallback: #ffffff for light, #151517 for dark
    applier.apply(full())
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-light')).toBe('#ffffff')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-dark')).toBe('#151517')

    // 3. When imageDark is true, light fallback darkens to #151517
    applier.apply(full({ imageDark: true }))
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-light')).toBe('#151517')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-dark')).toBe('#151517')

    // 4. CSS sheet contains 3-layer structure (base layer, ::before media layer, ::after scrim)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('#dsw-appearance-bg::before')
    expect(css).toContain('#dsw-appearance-bg::after')
    expect(css).toContain('opacity: var(--dsw-appearance-bg-opacity, 1)')
    expect(css).toContain('--dsw-appearance-bg-base-light')
    expect(css).toContain('--dsw-appearance-bg-base-dark')

    // 5. Clean disposal
    applier.dispose()
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-light')).toBe('')
    expect(body.style.getPropertyValue('--dsw-appearance-bg-base-dark')).toBe('')
  })

  it('marks translucent sidebars and hides the host session-list fade stripe until opaque or disposed', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const body = document.body
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('body[data-dsw-translucent-sidebar]')
    expect(css).toContain('[class$="_fade"]')

    applier.apply(full({ sidebarAlpha: 1 }))
    expect(body.hasAttribute('data-dsw-translucent-sidebar')).toBe(false)

    applier.apply(full({ sidebarAlpha: 0.4 }))
    expect(body.hasAttribute('data-dsw-translucent-sidebar')).toBe(true)

    applier.apply(full({ sidebarAlpha: 1 }))
    expect(body.hasAttribute('data-dsw-translucent-sidebar')).toBe(false)

    applier.apply(full({ sidebarAlpha: 0.2 }))
    expect(body.hasAttribute('data-dsw-translucent-sidebar')).toBe(true)
    applier.dispose()
    expect(body.hasAttribute('data-dsw-translucent-sidebar')).toBe(false)
  })

  it('keeps fullscreen right sidebar transparent and hides occluded columns when bg media or translucent surfaces are active (Issue #53)', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const html = document.documentElement
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''

    const panelSelector = 'html:is([data-dsw-has-bg], [data-dsw-translucent-surface]) #root [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]'
    const centerSelector = 'html:is([data-dsw-has-bg], [data-dsw-translucent-surface]) #root [class*="_frame"][data-rightbar-fullscreen] > [class*="_centerCol"]'
    const sidebarSelector = 'html:not([data-windows-titlebar]):is([data-dsw-has-bg], [data-dsw-translucent-surface]) body:not([data-windows-titlebar]) #root [class*="_frame"][data-rightbar-fullscreen]:not([data-sidebar-drawer]) > :is([class*="_sidebarCol"], [class*="_leadingSeat"])'

    expect(css).toContain(panelSelector)
    expect(css).toContain('background: transparent !important;')
    expect(css).toContain(centerSelector)
    expect(css).toContain('opacity: 0 !important;')
    expect(css).toContain('visibility: hidden !important;')
    expect(css).toContain('pointer-events: none !important;')
    expect(css).toContain(sidebarSelector)

    // 1. data-dsw-translucent-surface tracks surfaceAlpha < 1 and clears on 1 / dispose
    applier.apply(full({ surfaceAlpha: 1 }))
    expect(html.hasAttribute('data-dsw-translucent-surface')).toBe(false)

    applier.apply(full({ surfaceAlpha: 0.5 }))
    expect(html.hasAttribute('data-dsw-translucent-surface')).toBe(true)

    applier.apply(full({ surfaceAlpha: 1 }))
    expect(html.hasAttribute('data-dsw-translucent-surface')).toBe(false)

    // 2. Real DOM selector matching across fullscreen / Windows titlebar / drawer states
    const root = document.createElement('div')
    root.id = 'root'
    const frame = document.createElement('div')
    frame.className = 'mP3x-q_frame'
    const sidebarCol = document.createElement('div')
    sidebarCol.className = 'mP3x-q_sidebarCol'
    const centerCol = document.createElement('div')
    centerCol.className = 'mP3x-q_centerCol'
    const rightbarCol = document.createElement('div')
    rightbarCol.className = 'mP3x-q_rightbarCol'
    const leadingSeat = document.createElement('div')
    leadingSeat.className = 'mP3x-q_leadingSeat'
    const panel = document.createElement('div')
    panel.className = 'acoR2W_panel'
    panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
    rightbarCol.append(panel)
    frame.append(sidebarCol, centerCol, rightbarCol, leadingSeat)
    root.append(frame)
    document.body.append(root)

    try {
      // Inactive state (no bg media, opaque surface): nothing matches
      expect(panel.matches(panelSelector)).toBe(false)
      expect(centerCol.matches(centerSelector)).toBe(false)
      expect(sidebarCol.matches(sidebarSelector)).toBe(false)

      // Background media enabled, but rightbar is collapsed (no data-sidebar-right-open, no data-rightbar-fullscreen)
      applier.apply(full({ backgroundImage: 'data:image/png;base64,AAAA', surfaceAlpha: 1 }))
      expect(html.hasAttribute('data-dsw-has-bg')).toBe(true)
      expect(panel.matches(panelSelector)).toBe(false)
      expect(centerCol.matches(centerSelector)).toBe(false)
      expect(sidebarCol.matches(sidebarSelector)).toBe(false)

      // Open fullscreen rightbar: panel stays transparent, center/sidebar/leadingSeat are suppressed
      panel.setAttribute('data-sidebar-right-open', '')
      frame.setAttribute('data-rightbar-fullscreen', '')
      expect(panel.matches(panelSelector)).toBe(true)
      expect(centerCol.matches(centerSelector)).toBe(true)
      expect(sidebarCol.matches(sidebarSelector)).toBe(true)
      expect(leadingSeat.matches(sidebarSelector)).toBe(true)

      // Windows desktop leaves the left sidebar visible outside fullscreen rightbar
      html.setAttribute('data-windows-titlebar', '')
      expect(panel.matches(panelSelector)).toBe(true)
      expect(centerCol.matches(centerSelector)).toBe(true)
      expect(sidebarCol.matches(sidebarSelector)).toBe(false)
      html.removeAttribute('data-windows-titlebar')

      // Narrow drawer mode sits above fullscreen and stays visible/interactive
      frame.setAttribute('data-sidebar-drawer', '')
      expect(centerCol.matches(centerSelector)).toBe(true)
      expect(sidebarCol.matches(sidebarSelector)).toBe(false)
      frame.removeAttribute('data-sidebar-drawer')

      // Also activates with surfaceAlpha < 1 even without background media
      applier.apply(full({ backgroundImage: '', backgroundVideo: '', surfaceAlpha: 0 }))
      expect(html.hasAttribute('data-dsw-has-bg')).toBe(false)
      expect(html.hasAttribute('data-dsw-translucent-surface')).toBe(true)
      expect(panel.matches(panelSelector)).toBe(true)
      expect(centerCol.matches(centerSelector)).toBe(true)
      expect(sidebarCol.matches(sidebarSelector)).toBe(true)

      applier.dispose()
      expect(html.hasAttribute('data-dsw-has-bg')).toBe(false)
      expect(html.hasAttribute('data-dsw-translucent-surface')).toBe(false)
      expect(panel.matches(panelSelector)).toBe(false)
      expect(centerCol.matches(centerSelector)).toBe(false)
      expect(sidebarCol.matches(sidebarSelector)).toBe(false)
    } finally {
      html.removeAttribute('data-windows-titlebar')
      document.body.removeAttribute('data-windows-titlebar')
      root.remove()
      applier.dispose()
    }
  })

  it('remaps dsh-context light-mode static canvas tokens when wallpaper or translucent surfaces are active', () => {
    const { ctx } = fakeCtx()
    const applier = new AppearanceApplier(ctx)
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''

    expect(css).toContain('html:is([data-dsw-has-bg], [data-dsw-translucent-surface]) body:not([data-ds-dark-theme])')
    expect(css).toContain('--lc-canvas: var(--dsw-alias-bg-base);')
    expect(css).toContain('--lc-control-track: var(--dsw-alias-bg-layer-2);')
    applier.dispose()
  })
})

