/** Token override builder and preset catalog. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import {
  accentOnInk, APPEARANCE_PRESETS, BACKGROUND_BLUR_MAX, bubbleInk, buildTokenOverrides, composerButtonColors, DARK_PRESETS, GLASS_BLUR_MAX, LIGHT_PRESETS, OVERRIDE_SOURCE, selectionColors,
} from '../src/client/tokens.ts'
import { contrastRatio } from '../src/client/color.ts'

const full = (partial: Partial<AppearanceSettings> = {}): AppearanceSettings => ({ ...DEFAULT_SETTINGS, ...partial })

describe('buildTokenOverrides', () => {
  it('stock settings leave brand, info, label, and foreground tokens untouched', () => {
    const tokens = buildTokenOverrides(full())
    // Stock defaults must not alter host brand-primary or foreground contrast
    // tokens (prevents white-on-white QuestionComposer checkboxes in dark mode).
    expect(tokens['--dsw-alias-brand-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-state-business-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-info-fill']).toBeUndefined()
    expect(tokens['--dsw-alias-label-primary-foreground']).toBeUndefined()
    expect(tokens['--dsw-alias-label-primary-inverted']).toBeUndefined()
    // Surfaces, labels and borders are still left alone in the stock state.
    expect(tokens['--dsw-alias-bg-base']).toBeUndefined()
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
  })

  it('maps accent to the brand token group in both modes', () => {
    const tokens = buildTokenOverrides(full({ accent: '#4176e6' }))
    expect(tokens['--dsw-alias-brand-primary']).toEqual({ light: '#4176e6', dark: '#4176e6' })
    expect(tokens['--dsw-alias-state-business-primary']).toEqual({ light: '#4176e6', dark: '#4176e6' })
    expect(tokens['--dsw-alias-button-info-fill']).toEqual({ light: '#4176e6', dark: '#4176e6' })
    // Hover steps mix toward white in light mode and near-black in dark mode.
    const hover = tokens['--dsw-alias-button-primary-hover']!
    expect(hover.light).toMatch(/^#[0-9a-f]{6}$/)
    expect(hover.dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(hover.light).not.toBe(hover.dark)
  })

  it('maps background to the base token; panels and layers remain independent', () => {
    const tokens = buildTokenOverrides(full({ background: '#8899aa' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#8899aa', dark: '#8899aa' })
    expect(tokens['--dsw-alias-bg-layer-1']).toBeUndefined()
    expect(tokens['--dsw-specific-sidebar-fill']).toBeUndefined()
    expect(tokens['--dsw-specific-bubble']).toBeUndefined()
  })

  it('panel sets layer-1 and sidebar tokens independently from background', () => {
    const tokens = buildTokenOverrides(full({ background: '#8899aa', panel: '#203040' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#8899aa', dark: '#8899aa' })
    expect(tokens['--dsw-alias-bg-layer-1']).toEqual({ light: '#203040', dark: '#203040' })
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('maps text and border roles to their token groups; bubbles follow the panel, not accent', () => {
    const tokens = buildTokenOverrides(full({
      text: '#111111', border: '#333333', accent: '#3a4674', panel: '#203040',
    }))
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#111111', dark: '#111111' })
    expect(tokens['--dsw-alias-label-secondary']).toBeDefined()
    expect(tokens['--dsw-alias-border-l1']).toEqual({ light: '#333333', dark: '#333333' })
    // Bubbles follow the panel surface, decoupled from accent.
    expect(tokens['--dsw-specific-bubble']).toEqual({ light: '#203040', dark: '#203040' })
    expect(tokens['--dsw-specific-bubble-highlight']).toBeDefined()
    // When panel is unset and accent is set, bubbles do NOT follow accent.
    const accentOnly = buildTokenOverrides(full({ accent: '#3a4674' }))
    expect(accentOnly['--dsw-specific-bubble']).toBeUndefined()
    // Default (no custom panel or bg) keeps bubble tokens unset so stock theme takes effect.
    const none = buildTokenOverrides(full({}))
    expect(none['--dsw-specific-bubble']).toBeUndefined()
  })

  it('bubble tokens strictly follow panel and decouple from accent under solid and translucent modes', () => {
    // 1. Changing accent alone must not affect bubble tokens
    const accentOnly = buildTokenOverrides(full({ accent: '#e11d48' }))
    expect(accentOnly['--dsw-alias-brand-primary']).toEqual({ light: '#e11d48', dark: '#e11d48' })
    expect(accentOnly['--dsw-specific-bubble']).toBeUndefined()

    // 2. Setting panel customizes bubble tokens
    const withPanel = buildTokenOverrides(full({ accent: '#e11d48', panel: '#2a3b4c' }))
    expect(withPanel['--dsw-specific-bubble']).toEqual({ light: '#2a3b4c', dark: '#2a3b4c' })

    // 3. Changing accent with panel set keeps bubble at panel color
    const changedAccent = buildTokenOverrides(full({ accent: '#10b981', panel: '#2a3b4c' }))
    expect(changedAccent['--dsw-specific-bubble']).toEqual({ light: '#2a3b4c', dark: '#2a3b4c' })
    expect(changedAccent['--dsw-alias-brand-primary']).toEqual({ light: '#10b981', dark: '#10b981' })

    // 4. Translucency bakes panel into bubble, not accent
    const translucent = buildTokenOverrides(full({ accent: '#10b981', panel: '#2a3b4c', surfaceAlpha: 0.5 }))
    expect(translucent['--dsw-specific-bubble']?.light).toBe('rgba(42, 59, 76, 0.5)')
  })

  it('re-derives the on-ink pair when the text color is overridden', () => {
    // The harness badge paints its chip with label-primary and its letters with
    // -inverted; neutral checkmarks (e.g. QuestionComposer) pair label-primary
    // with -foreground. Both tokens always pair with label-primary, never accent.
    const light = buildTokenOverrides(full({ text: '#fafaf9' }))
    expect(light['--dsw-alias-label-primary-inverted']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    expect(light['--dsw-alias-label-primary-foreground']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    // A dark text color flips both inks light again.
    const dark = buildTokenOverrides(full({ text: '#111111' }))
    expect(dark['--dsw-alias-label-primary-inverted']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    expect(dark['--dsw-alias-label-primary-foreground']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    // A mid-tone chip contrasts more with the dark ink (4.7:1 vs 3.8:1), so
    // the winner is picked by WCAG contrast, not a luminance threshold.
    const mid = buildTokenOverrides(full({ text: '#808080' }))
    expect(mid['--dsw-alias-label-primary-inverted']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    expect(mid['--dsw-alias-label-primary-foreground']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    // Shorthand hex reaches the builder un-normalized within a session (the
    // persistence sanitizer expands it only on reload), so ink selection and
    // the dark-flip check must handle #rgb directly.
    const shorthand = buildTokenOverrides(full({ text: '#888' }))
    expect(shorthand['--dsw-alias-label-primary-inverted']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    // A light shorthand background must not trigger the dark-family flip.
    const lightShorthand = buildTokenOverrides(full({ background: '#eee' }))
    expect(lightShorthand['--dsw-alias-label-primary']).toBeUndefined()
    // A four-character value without the # prefix is malformed, not a
    // shorthand — it must classify as dark (luminance 0), not expand to a
    // fake color.
    const malformed = buildTokenOverrides(full({ text: 'abcd' }))
    expect(malformed['--dsw-alias-label-primary-inverted']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
  })

  it('customizing accent never overrides global label-primary-foreground; accentOnInk derives per-mode ink', () => {
    expect(accentOnInk(full())).toEqual({ light: null, dark: null })

    const darkAccent = buildTokenOverrides(full({ accent: '#111111' }))
    expect(darkAccent['--dsw-alias-label-primary-foreground']).toBeUndefined()
    expect(darkAccent['--dsw-alias-label-primary-inverted']).toBeUndefined()
    expect(accentOnInk(full({ accent: '#111111' }))).toEqual({ light: '#fafaf9', dark: '#fafaf9' })

    const lightAccent = buildTokenOverrides(full({ accent: '#ffffff' }))
    expect(lightAccent['--dsw-alias-label-primary-foreground']).toBeUndefined()
    expect(accentOnInk(full({ accent: '#ffffff' }))).toEqual({ light: '#0f1115', dark: '#0f1115' })

    // Per-mode independence + global label-primary-foreground remains paired with text even when accent is set.
    const mixed = full({
      light: { ...DEFAULT_LIGHT_THEME, accent: '#111111', text: '#fafaf9' },
      dark: { ...DEFAULT_DARK_THEME, accent: '#ffffff', text: '#111111' },
    })
    expect(accentOnInk(mixed)).toEqual({ light: '#fafaf9', dark: '#0f1115' })
    const mixedTokens = buildTokenOverrides(mixed)
    expect(mixedTokens['--dsw-alias-label-primary-foreground']).toEqual({ light: '#0f1115', dark: '#fafaf9' })
    expect(mixedTokens['--dsw-alias-label-primary-inverted']).toEqual({ light: '#0f1115', dark: '#fafaf9' })
  })

  it('single-mode accent customization keeps stock brand-primary and button-primary-hover in the untouched mode', () => {
    const lightOnly = buildTokenOverrides(full({
      light: { ...DEFAULT_LIGHT_THEME, accent: '#ff00aa' },
      dark: { ...DEFAULT_DARK_THEME, accent: '' },
    }))
    expect(lightOnly['--dsw-alias-brand-primary']).toEqual({ light: '#ff00aa', dark: '#f9fafb' })
    expect(lightOnly['--dsw-alias-button-info-fill']).toEqual({ light: '#ff00aa', dark: '#7aaaff' })
    expect(lightOnly['--dsw-alias-button-primary-hover']?.dark).toBe('#ebeef2')

    const darkOnly = buildTokenOverrides(full({
      light: { ...DEFAULT_LIGHT_THEME, accent: '' },
      dark: { ...DEFAULT_DARK_THEME, accent: '#7c9cff' },
    }))
    expect(darkOnly['--dsw-alias-brand-primary']).toEqual({ light: '#0f1115', dark: '#7c9cff' })
    expect(darkOnly['--dsw-alias-button-info-fill']).toEqual({ light: '#4176e6', dark: '#7c9cff' })
    expect(darkOnly['--dsw-alias-button-primary-hover']?.light).toBe('#43454a')
  })

  it('independent text customization per mode does not leak into the other mode', () => {
    // When only light mode text is customized (e.g. dawn preset or dark text in light mode),
    // dark mode must NOT inherit the dark text and must keep its stock light ink and readable secondary steps.
    const lightOnly = buildTokenOverrides(full({
      light: { ...DEFAULT_LIGHT_THEME, text: '#292524' },
      dark: { ...DEFAULT_DARK_THEME, text: '' },
    }))
    expect(lightOnly['--dsw-alias-label-primary']?.light).toBe('#292524')
    expect(lightOnly['--dsw-alias-label-primary']?.dark).toBe('#fafaf9')
    expect(lightOnly['--dsw-alias-label-secondary']?.dark).toBe('#d6d3d1')
    expect(lightOnly['--dsw-alias-label-tertiary']?.dark).toBe('#808285')

    // When only dark mode text is customized, light mode keeps its stock dark ink.
    const darkOnly = buildTokenOverrides(full({
      light: { ...DEFAULT_LIGHT_THEME, text: '' },
      dark: { ...DEFAULT_DARK_THEME, text: '#e6e9f4' },
    }))
    expect(darkOnly['--dsw-alias-label-primary']?.light).toBe('#0f1115')
    expect(darkOnly['--dsw-alias-label-primary']?.dark).toBe('#e6e9f4')
    expect(darkOnly['--dsw-alias-label-secondary']?.light).toBe('#61666b')
    expect(darkOnly['--dsw-alias-label-tertiary']?.light).toBe('#9ea3a8')
  })

  it('bubbleInk returns null when readable (>= 3.5:1) and contrasting ink only when needed', () => {
    // Default: stock light (#0f1115 on #edf3fe) and dark (#fafaf9 on #2c2c2e) are already readable.
    expect(bubbleInk(full())).toEqual({ light: null, dark: null })
    // A dark panel in light mode flips the ink light; a light panel in dark mode flips dark.
    const darkPanel = full({ panel: '#111111', light: { ...DEFAULT_LIGHT_THEME, panel: '#111111' } })
    const brightPanel = full({ panel: '#ffffff', dark: { ...DEFAULT_DARK_THEME, panel: '#ffffff' } })
    expect(bubbleInk(darkPanel).light).toBe('#fafaf9')
    expect(bubbleInk(brightPanel).dark).toBe('#0f1115')
    // Scenario: dark blue panel (#355eb6) in light mode needs white ink; pale blue (#749aec) is already readable with dark text,
    // whereas in dark mode pale blue (#749aec) clashes with light text and falls back to dark ink.
    const darkSurf = full({ light: { ...DEFAULT_LIGHT_THEME, panel: '#355eb6' } })
    const paleSurf = full({
      light: { ...DEFAULT_LIGHT_THEME, panel: '#749aec' },
      dark: { ...DEFAULT_DARK_THEME, panel: '#749aec' },
    })
    expect(bubbleInk(darkSurf).light).toBe('#fafaf9')
    expect(bubbleInk(paleSurf)).toEqual({ light: null, dark: '#0f1115' })
    // Per-mode independence: dark panel light mode, light panel dark mode.
    const mixed = full({
      light: { ...DEFAULT_LIGHT_THEME, panel: '#111111' },
      dark: { ...DEFAULT_DARK_THEME, panel: '#ffffff' },
    })
    expect(bubbleInk(mixed)).toEqual({ light: '#fafaf9', dark: '#0f1115' })
    // User-selected `text` color stays untouched (returns null) whenever it is readable (>= 3.5:1),
    // and only falls back to `#fafaf9` / `#0f1115` when it would clash with the bubble surface.
    const customReadableText = full({
      light: { ...DEFAULT_LIGHT_THEME, panel: '#f4f1ea', text: '#292524' },
      dark: { ...DEFAULT_DARK_THEME, panel: '#232737', text: '#e6e9f4' },
    })
    expect(bubbleInk(customReadableText)).toEqual({ light: null, dark: null })
    const clashingText = full({
      light: { ...DEFAULT_LIGHT_THEME, panel: '#355eb6', text: '#1e293b' },
    })
    expect(bubbleInk(clashingText).light).toBe('#fafaf9')
    // Transparent bubble (surfaceAlpha = 0) composites against background / dark wallpaper
    const transparentOverDarkBg = full({
      surfaceAlpha: 0,
      light: { ...DEFAULT_LIGHT_THEME, background: '#111111' },
    })
    expect(bubbleInk(transparentOverDarkBg).light).toBe('#fafaf9')
    // Under imageDark with unset text, light mode flips label-primary to #fafaf9 (already readable -> null);
    // an explicit dark text override that clashes with the dark wallpaper falls back to #fafaf9.
    const darkWallpaperBubble = full({
      backgroundImage: 'data:image/webp;base64,AAAA',
      imageDark: true,
      surfaceAlpha: 0,
    })
    expect(bubbleInk(darkWallpaperBubble).light).toBeNull()
    const darkWallpaperClashingText = full({
      backgroundImage: 'data:image/webp;base64,AAAA',
      imageDark: true,
      surfaceAlpha: 0,
      light: { ...DEFAULT_LIGHT_THEME, text: '#111111' },
    })
    expect(bubbleInk(darkWallpaperClashingText).light).toBe('#fafaf9')
  })

  it('turns the surface tokens translucent below full opacity', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418', surfaceAlpha: 0.6, sidebarAlpha: 0.6 }))
    const base = tokens['--dsw-alias-bg-base']!
    // A role color is baked as plain rgba per mode.
    expect(base.light).toBe('rgba(16, 20, 24, 0.6)')
    expect(base.dark).toBe(base.light)
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
    expect(tokens['--dsw-specific-input-major']).toBeDefined()
    expect(tokens['--dsw-specific-bubble']).toBeDefined()
  })

  it('stays opaque at full surface opacity', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 1 }))
    for (const [name, value] of Object.entries(tokens)) {
      // The independent input/code knobs bake rgba(…, 1) even at full
      // panel opacity; everything else stays free of rgba().
      if (name.startsWith('--dsw-specific-input-major')) {
        expect(value.light).toBe('rgba(255, 255, 255, 1)')
        continue
      }
      if (name.startsWith('--dsw-alias-markdown-code-block')) {
        expect(value.light).toBe('rgba(249, 250, 251, 1)')
        continue
      }
      if (name.startsWith('--dsw-alias-markdown-inline-code')) {
        expect(value.light).toBe('rgba(65, 118, 230, 0.22)')
        continue
      }
      expect(value.light).not.toContain('rgba(')
    }
  })

  it('emits solid menu tokens at full opacity so cyclic fallback is prevented', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 1 }))
    expect(tokens['--dsw-specific-menu']).toEqual({ light: '#ffffff', dark: '#353638' })
    expect(tokens['--dsw-menu-surface-fill']).toEqual({ light: '#ffffff', dark: '#353638' })
  })

  it('emits solid interactive hover tokens at full opacity (AGENTS.md hover mechanism)', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 1 }))
    expect(tokens['--dsw-alias-interactive-bg-hover']).toEqual({ light: '#f1f3f5', dark: '#353638' })
    expect(tokens['--dsw-alias-interactive-bg-hover-solid']).toEqual({ light: '#f1f3f5', dark: '#353638' })
  })

  it('custom panel color drives solid menu tokens at full opacity', () => {
    const tokens = buildTokenOverrides(full({
      surfaceAlpha: 1,
      panel: '#f0e0d0',
      light: { accent: '', background: '', panel: '#f0e0d0', input: '', text: '', border: '', preset: '' },
    }))
    expect(tokens['--dsw-specific-menu']?.light).not.toBe('#ffffff')
    expect(tokens['--dsw-menu-surface-fill']?.light).toBe(tokens['--dsw-specific-menu']?.light)
    expect(tokens['--dsw-specific-menu']?.light).not.toContain('rgba(')
  })

  it('translucency with every role color empty falls back to the stock palette', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 0.6 }))
    expect(Object.keys(tokens).length).toBeGreaterThan(0)
    for (const value of Object.values(tokens)) {
      // Every translucent value must be a valid rgba() (never a var() or
      // color-mix: referencing the token itself would cycle and turn the
      // surface fully transparent — the 0%/100%-only regression). Alpha 1
      // is legal: the independent input/code knobs stay opaque by default.
      if (!value.light.startsWith('rgba')) continue
      expect(value.light).toMatch(/^rgba\(\d+, \d+, \d+, (0\.\d+|1)\)$/)
    }
    // Stock light-mode base becomes translucent white.
    expect(tokens['--dsw-alias-bg-base']!.light).toBe('rgba(255, 255, 255, 0.6)')
    // Stock dark-mode base becomes translucent near-black.
    expect(tokens['--dsw-alias-bg-base']!.dark).toBe('rgba(21, 21, 23, 0.6)')
  })

  it('translucent surfaces follow panel color, leaving background decoupled', () => {
    const bgOnly = buildTokenOverrides(full({ background: '#101418', surfaceAlpha: 0.5 }))
    expect(bgOnly['--dsw-alias-bg-base']!.light).toBe('rgba(16, 20, 24, 0.5)')
    expect(bgOnly['--dsw-alias-bg-layer-1']!.light).toBe('rgba(255, 255, 255, 0.5)')

    const withPanel = buildTokenOverrides(full({ background: '#101418', panel: '#203040', surfaceAlpha: 0.5 }))
    expect(withPanel['--dsw-alias-bg-base']!.light).toBe('rgba(16, 20, 24, 0.5)')
    expect(withPanel['--dsw-alias-bg-layer-1']!.light).toBe('rgba(32, 48, 64, 0.5)')
  })

  it('layer-2 (settings panel root) follows the panel color under translucency', () => {
    const tokens = buildTokenOverrides(full({ panel: '#9a2323', surfaceAlpha: 0.6 }))
    // mix(#9a2323, #ffffff, 0.08) = rgb(162, 53, 53).
    expect(tokens['--dsw-alias-bg-layer-2']!.light).toBe('rgba(162, 53, 53, 0.6)')
    // Without a panel color it stays on the neutral surface family.
    const stock = buildTokenOverrides(full({ surfaceAlpha: 0.6 }))
    expect(stock['--dsw-alias-bg-layer-2']!.light).toBe('rgba(255, 255, 255, 0.6)')
  })

  it('keeps global button tokens opaque under translucency and delegates inputAlpha button fills to composerButtonColors', () => {
    const stock = buildTokenOverrides(full({ surfaceAlpha: 0, inputAlpha: 1 }))
    // Global button tokens stay untouched (opaque) so QuestionComposer "推荐"
    // badges (--dsw-alias-button-info-fill) and modal submit buttons never go invisible.
    expect(stock['--dsw-alias-button-primary-fill']).toBeUndefined()
    expect(stock['--dsw-alias-button-info-fill']).toBeUndefined()
    expect(composerButtonColors(full({ surfaceAlpha: 0, inputAlpha: 1 })).active).toBe(false)

    // With inputAlpha < 1 and custom accent, global tokens stay opaque while composerButtonColors bakes inputAlpha.
    const half = full({ accent: '#4176e6', surfaceAlpha: 0.6, inputAlpha: 0.3 })
    const halfTokens = buildTokenOverrides(half)
    expect(halfTokens['--dsw-alias-button-info-fill']).toEqual({ light: '#4176e6', dark: '#4176e6' })
    expect(halfTokens['--dsw-alias-button-primary-fill']).toBeUndefined()
    const btns = composerButtonColors(half)
    expect(btns.active).toBe(true)
    expect(btns.light.primaryFill).toBe('rgba(65, 118, 230, 0.3)')
    expect(btns.light.infoFill).toBe('rgba(65, 118, 230, 0.3)')
  })

  it('composer button hovers ride inputAlpha too while global hovers remain opaque', () => {
    const halfCustom = full({ accent: '#4176e6', surfaceAlpha: 0.6, inputAlpha: 0.3 })
    const halfTokens = buildTokenOverrides(halfCustom)
    expect(halfTokens['--dsw-alias-button-info-hover']!.light).toBe('#5e8bea')
    expect(halfTokens['--dsw-alias-button-primary-hover']!.dark).toBe('#3761b8')

    const customBtns = composerButtonColors(halfCustom)
    expect(customBtns.light.infoHover).toBe('rgba(94, 139, 234, 0.3)')
    expect(customBtns.dark.primaryHover).toBe('rgba(55, 97, 184, 0.3)')

    // Unset accent falls back to the stock hover palette inside composerButtonColors.
    const stockBtns = composerButtonColors(full({ surfaceAlpha: 0.6, inputAlpha: 0.3 }))
    expect(stockBtns.light.infoHover).toBe('rgba(122, 170, 255, 0.3)')
    expect(stockBtns.dark.primaryHover).toBe('rgba(235, 238, 242, 0.3)')

    // At full surface opacity custom accent hovers stay opaque stepped hexes; stock leaves them undefined.
    expect(buildTokenOverrides(full())['--dsw-alias-button-primary-hover']).toBeUndefined()
    const solidCustom = buildTokenOverrides(full({ accent: '#4176e6' }))
    expect(solidCustom['--dsw-alias-button-info-hover']!.light).toBe('#5e8bea')
    expect(solidCustom['--dsw-alias-button-primary-hover']!.light).toBe('#6b94ec')
  })

  it('inline code keeps a low-alpha brand tint so emphasized text stays visible', () => {
    // Stock settings tint inline code with the host blue per mode.
    const stock = buildTokenOverrides(full({ surfaceAlpha: 0.6 }))
    expect(stock['--dsw-alias-markdown-inline-code']!.light).toBe('rgba(65, 118, 230, 0.22)')
    expect(stock['--dsw-alias-markdown-inline-code']!.dark).toBe('rgba(103, 158, 254, 0.22)')
    // The user accent wins when set.
    const accented = buildTokenOverrides(full({ surfaceAlpha: 0.6, accent: '#ff0000' }))
    expect(accented['--dsw-alias-markdown-inline-code']!.light).toBe('rgba(255, 0, 0, 0.22)')
    // The emphasis alpha slider is honored.
    const tuned = buildTokenOverrides(full({ surfaceAlpha: 0.6, emphasisAlpha: 0.35 }))
    expect(tuned['--dsw-alias-markdown-inline-code']!.light).toBe('rgba(65, 118, 230, 0.35)')
    // Explicit empty accent behaves the same as stock.
    const legacyEmpty = buildTokenOverrides(full({ surfaceAlpha: 0.6, accent: '' }))
    expect(legacyEmpty['--dsw-alias-markdown-inline-code']!.light).toBe('rgba(65, 118, 230, 0.22)')
    // Code blocks are absolute: opaque by default (independent of the panel).
    expect(stock['--dsw-alias-markdown-code-block']!.light).toBe('rgba(249, 250, 251, 1)')
  })

  it('input and code-block opacity are absolute and independent of the panel', () => {
    const tuned = buildTokenOverrides(full({ surfaceAlpha: 0, inputAlpha: 1, codeAlpha: 0.8 }))
    // 100% = fully opaque even when the panel is fully transparent.
    expect(tuned['--dsw-specific-input-major']!.light).toBe('rgba(255, 255, 255, 1)')
    expect(tuned['--dsw-alias-markdown-code-block']!.light).toBe('rgba(249, 250, 251, 0.8)')
    expect(tuned['--dsw-alias-markdown-code-block-banner']!.light).toBe('rgba(249, 250, 251, 0.8)')
    // Lower values are independent of the panel alpha too.
    const half = buildTokenOverrides(full({ surfaceAlpha: 0.6, inputAlpha: 0.3 }))
    expect(half['--dsw-specific-input-major']!.light).toBe('rgba(255, 255, 255, 0.3)')
  })

  it('independent knobs survive a fully opaque panel (regression: 100% panel reset the input)', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 1, inputAlpha: 0.8, codeAlpha: 0.5, emphasisAlpha: 0.4 }))
    // The panel at 100% must not disable the independent input/code/emphasis baking.
    expect(tokens['--dsw-specific-input-major']!.light).toBe('rgba(255, 255, 255, 0.8)')
    expect(tokens['--dsw-alias-markdown-code-block']!.light).toBe('rgba(249, 250, 251, 0.5)')
    expect(tokens['--dsw-alias-markdown-inline-code']!.light).toBe('rgba(65, 118, 230, 0.4)')
  })

  it('the sidebar can opt out of the surface translucency', () => {
    const translucent = buildTokenOverrides(full({ surfaceAlpha: 0.5, sidebarAlpha: 0.5 }))
    expect(translucent['--dsw-specific-sidebar-fill']).toBeDefined()
    const opaque = buildTokenOverrides(full({ surfaceAlpha: 0.5, sidebarAlpha: 1, sidebarOpaque: true }))
    expect(opaque['--dsw-specific-sidebar-fill']).toBeUndefined()
    // Everything else still follows.
    expect(opaque['--dsw-alias-bg-base']).toBeDefined()
  })

  it('sidebar opacity is independent of surface opacity', () => {
    // Transparent sidebar (0%) with opaque surfaces (100%) - Issue #37
    const transparentSidebar = buildTokenOverrides(full({ surfaceAlpha: 1, sidebarAlpha: 0 }))
    expect(transparentSidebar['--dsw-specific-sidebar-fill']!.light).toBe('rgba(249, 250, 251, 0)')
    expect(transparentSidebar['--dsw-specific-sidebar-nav-item-active']!.light).toBe('rgba(235, 238, 242, 0)')

    // Opaque sidebar (100%) with translucent surfaces (50%)
    const opaqueSidebar = buildTokenOverrides(full({ surfaceAlpha: 0.5, sidebarAlpha: 1 }))
    expect(opaqueSidebar['--dsw-specific-sidebar-fill']).toBeUndefined()
    expect(opaqueSidebar['--dsw-specific-sidebar-nav-item-active']).toBeUndefined()
    expect(opaqueSidebar['--dsw-alias-bg-layer-1']).toBeDefined()
  })

  it('settings surfaces (selected nav tab, menus) follow the translucency too', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 0.5, sidebarAlpha: 0.5 }))
    expect(tokens['--dsw-specific-sidebar-nav-item-active']!.light).toBe('rgba(235, 238, 242, 0.5)')
    expect(tokens['--dsw-specific-sidebar-nav-item-hover']!.light).toBe('rgba(241, 243, 245, 0.5)')
    expect(tokens['--dsw-specific-menu']).toBeDefined()
    expect(tokens['--dsw-menu-surface-fill']).toBeDefined()
    expect(tokens['--dsw-alias-fill-l1']).toBeDefined()
  })

  it('accent never overrides the brand-text ink token', () => {
    const tokens = buildTokenOverrides(full({ accent: '#4176e6' }))
    expect(tokens['--dsw-alias-brand-text']).toBeUndefined()
    expect(tokens['--dsw-alias-brand-primary']).toEqual({ light: '#4176e6', dark: '#4176e6' })
  })

  it('makes the base canvas transparent when a background image is set', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
  })

  it('a dark user background alone does not flip panels or controls (background and panel are decoupled)', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#101418', dark: '#101418' })
    expect(tokens['--dsw-alias-bg-layer-1']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
    expect(tokens['--dsw-specific-selector']).toBeUndefined()
  })

  it('a light user background does not tint the controls; controls follow panel', () => {
    const tokens = buildTokenOverrides(full({ background: '#d0d0d0' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#d0d0d0', dark: '#d0d0d0' })
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
    expect(tokens['--dsw-specific-selector']).toBeUndefined()
  })

  it('neutral controls follow the panel color when a panel is set', () => {
    const tokens = buildTokenOverrides(full({ panel: '#9a2323' }))
    // Buttons lift toward white in both modes.
    expect(tokens['--dsw-alias-button-elevated-fill']).toEqual({ light: '#a03030', dark: '#a03030' })
    expect(tokens['--dsw-alias-button-floating-hover']).toEqual({ light: '#a63d3d', dark: '#a63d3d' })
    // The "+" trigger and its hover ride the same control family.
    expect(tokens['--dsw-specific-selector']).toEqual({ light: '#a03030', dark: '#a03030' })
    expect(tokens['--dsw-alias-interactive-bg-hover-solid']).toEqual({ light: '#a63d3d', dark: '#a63d3d' })
    // The settings nav highlight emphasizes: darker in light mode toward the
    // dark base, lighter in dark mode toward white.
    expect(tokens['--dsw-specific-sidebar-nav-item-active']).toEqual({ light: '#8d2222', dark: '#a43939' })
    expect(tokens['--dsw-specific-sidebar-nav-item-hover']).toEqual({ light: '#932222', dark: '#9f2e2e' })
    // A panel wins over the background as the control base (light bg avoids
    // the dark flip, which would override the whole control family anyway).
    const withBackground = buildTokenOverrides(full({ panel: '#9a2323', background: '#d0d0d0' }))
    expect(withBackground['--dsw-alias-button-elevated-fill']).toEqual({ light: '#a03030', dark: '#a03030' })
  })

  it('translucent neutral controls bake the panel-derived fills', () => {
    const tokens = buildTokenOverrides(full({ panel: '#9a2323', surfaceAlpha: 0.6, sidebarAlpha: 0.6 }))
    expect(tokens['--dsw-alias-button-elevated-fill']!.light).toBe('rgba(160, 48, 48, 0.6)')
    expect(tokens['--dsw-specific-sidebar-nav-item-active']!.light).toBe('rgba(141, 34, 34, 0.6)')
    // The hover bakes at the surface alpha; the "+" trigger rides the input
    // opacity instead (default 1 = solid).
    expect(tokens['--dsw-alias-interactive-bg-hover-solid']!.light).toBe('rgba(166, 61, 61, 0.6)')
    expect(tokens['--dsw-specific-selector']!.light).toBe('rgba(160, 48, 48, 1)')
  })

  it('the input knob works at a fully opaque panel (action affordances)', () => {
    const inputOnly = full({ surfaceAlpha: 1, inputAlpha: 0.3 })
    const tokens = buildTokenOverrides(inputOnly)
    // Global button-info-fill and button-primary-fill stay untouched so QuestionComposer
    // "推荐" badges stay readable at any inputAlpha; composer buttons use composerButtonColors.
    expect(tokens['--dsw-alias-button-primary-fill']).toBeUndefined()
    expect(tokens['--dsw-alias-button-info-fill']).toBeUndefined()
    expect(tokens['--dsw-specific-selector']!.light).toBe('rgba(245, 246, 247, 0.3)')
    const btns = composerButtonColors(inputOnly)
    expect(btns.active).toBe(true)
    expect(btns.light.primaryFill).toBe('rgba(15, 17, 21, 0.3)')
    expect(btns.dark.primaryFill).toBe('rgba(249, 250, 251, 0.3)')
    expect(btns.light.infoFill).toBe('rgba(65, 118, 230, 0.3)')
    expect(btns.dark.infoFill).toBe('rgba(122, 170, 255, 0.3)')
    // Menus are controlled exclusively by popoverAlpha (default 1 = opaque),
    // never snapping translucent just because inputAlpha < 1 or glassBlur > 0.
    expect(tokens['--dsw-specific-menu']).toEqual({ light: '#ffffff', dark: '#353638' })
    expect(tokens['--dsw-menu-surface-fill']).toEqual({ light: '#ffffff', dark: '#353638' })
  })

  it('popoverAlpha controls menu & popover tokens independently from surfaceAlpha, inputAlpha, and glassBlur', () => {
    // 1. surfaceAlpha = 0, inputAlpha = 0, glassBlur = 16, popoverAlpha = 1 -> menus stay 100% opaque
    const opaqueMenus = buildTokenOverrides(full({
      surfaceAlpha: 0,
      inputAlpha: 0,
      glassBlur: 16,
      popoverAlpha: 1,
    }))
    expect(opaqueMenus['--dsw-specific-menu']).toEqual({ light: '#ffffff', dark: '#353638' })
    expect(opaqueMenus['--dsw-menu-surface-fill']).toEqual({ light: '#ffffff', dark: '#353638' })

    // 2. surfaceAlpha = 1, popoverAlpha = 0.65 -> menus become 65% translucent while panels stay opaque
    const translucentMenus = buildTokenOverrides(full({
      surfaceAlpha: 1,
      popoverAlpha: 0.65,
    }))
    expect(translucentMenus['--dsw-specific-menu']).toEqual({
      light: 'rgba(255, 255, 255, 0.65)',
      dark: 'rgba(53, 54, 56, 0.65)',
    })
    expect(translucentMenus['--dsw-menu-surface-fill']).toEqual({
      light: 'rgba(255, 255, 255, 0.65)',
      dark: 'rgba(53, 54, 56, 0.65)',
    })
    expect(translucentMenus['--dsw-alias-bg-layer-1']).toBeUndefined()

    // 3. popoverAlpha = 0 -> menus are 100% transparent
    const zeroMenus = buildTokenOverrides(full({
      surfaceAlpha: 1,
      popoverAlpha: 0,
    }))
    expect(zeroMenus['--dsw-specific-menu']).toEqual({
      light: 'rgba(255, 255, 255, 0)',
      dark: 'rgba(53, 54, 56, 0)',
    })
  })

  it('a dark image (imageDark) flips the family from the dark base', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
    const layer1 = tokens['--dsw-alias-bg-layer-1']!
    expect(layer1.light).not.toBe('#151517')
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    // Input, platform module, and code block surfaces flip dark to prevent white-on-white text in default palette
    expect(tokens['--dsw-specific-input-major']!.light).not.toBe('rgba(255, 255, 255, 1)')
    expect(tokens['--dsw-alias-bg-module-platform']!.light).toBeDefined()
    expect(tokens['--dsw-alias-bg-layer-3']!.light).toBeDefined()
    expect(tokens['--dsw-alias-markdown-code-block']!.light).not.toBe('rgba(249, 250, 251, 1)')
  })

  it('a bright image (no imageDark) flips nothing beyond the transparent base', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA' }))
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
  })

  it('makes the base canvas transparent when only a background video is set', () => {
    // Image and video share one background layer, so the video alone must
    // punch out the frame background too — otherwise the layer stays hidden.
    const tokens = buildTokenOverrides(full({ backgroundVideo: 'video-key' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
    // No image analysis backs a video, so the surface family stays stock.
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
  })

  it('keeps the base canvas transparent under surface translucency', () => {
    // Alpha-baking a transparent base used to emit `rgba(NaN, NaN, NaN, a)`,
    // which drops the token and lets the opaque frame swallow the layer again.
    const video = buildTokenOverrides(full({ backgroundVideo: 'video-key', surfaceAlpha: 0.6 }))
    expect(video['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
    const image = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA', surfaceAlpha: 0.6 }))
    expect(image['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
  })

  it('an explicit text color wins over the dark wallpaper flipped labels', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true, text: '#111111' }))
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#111111', dark: '#111111' })
    // Buttons follow the dark wallpaper surface.
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeDefined()
  })

  it('emits independent token overrides for light and dark modes', () => {
    const tokens = buildTokenOverrides(full({
      light: {
        accent: '#d97706',
        background: '#fbfaf8',
        panel: '#f4f1ea',
        input: '#ffffff',
        text: '#292524',
        border: '#e7e5e4',
        preset: 'dawn',
      },
      dark: {
        accent: '#7c9cff',
        background: '#1b1e2c',
        panel: '#232737',
        input: '#202435',
        text: '#e6e9f4',
        border: '#343a52',
        preset: 'midnight',
      },
    }))
    expect(tokens['--dsw-alias-brand-primary']).toEqual({ light: '#d97706', dark: '#7c9cff' })
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#fbfaf8', dark: '#1b1e2c' })
    expect(tokens['--dsw-alias-bg-layer-1']).toEqual({ light: '#f4f1ea', dark: '#232737' })
    expect(tokens['--dsw-specific-input-major']).toEqual({ light: 'rgba(255, 255, 255, 1)', dark: 'rgba(32, 36, 53, 1)' })
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#292524', dark: '#e6e9f4' })
    expect(tokens['--dsw-alias-border-l1']).toEqual({ light: '#e7e5e4', dark: '#343a52' })
  })

  it('guarantees WCAG AA (>= 4.5:1) contrast for tertiary text and placeholder caption (Issue #33)', () => {
    // Pure black text in light mode
    const blackText = buildTokenOverrides(full({ text: '#000000' }))
    const secL = blackText['--dsw-alias-label-secondary']!.light
    const terL = blackText['--dsw-alias-label-tertiary']!.light
    const capL = blackText['--dsw-alias-label-caption']!.light
    const menuL = blackText['--dsw-alias-menu-icon']!.light

    // Secondary must satisfy 7:1
    expect(contrastRatio(secL, '#ffffff')).toBeGreaterThanOrEqual(7.0)
    // Tertiary and caption must satisfy AA 4.5:1 (previously capped at 3.03:1)
    expect(contrastRatio(terL, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(capL, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // Menu icon must satisfy 7:1
    expect(contrastRatio(menuL, '#ffffff')).toBeGreaterThanOrEqual(7.0)

    // Dark mode with light panel: menu-icon must remain readable (>= 7:1) instead of blending in
    const lightPanelInDark = buildTokenOverrides(full({
      dark: { ...DEFAULT_DARK_THEME, panel: '#e5e7eb', text: '#111827' },
    }))
    const menuD = lightPanelInDark['--dsw-alias-menu-icon']!.dark
    expect(contrastRatio(menuD, '#e5e7eb')).toBeGreaterThanOrEqual(7.0)
  })

  it('pairs -inverted, -foreground, button-contrast-fill, and QuestionComposer badge tokens under dark wallpaper (imageDark)', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true }))
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    expect(tokens['--dsw-alias-label-primary-inverted']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    expect(tokens['--dsw-alias-label-primary-foreground']).toEqual({ light: '#0f1115', dark: '#0f1115' })
    expect(tokens['--dsw-alias-button-contrast-fill']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    // QuestionComposer "推荐" badge uses active-accent background + button-info-fill text.
    expect(tokens['--dsw-specific-sidebar-nav-item-active-accent']).toEqual({ light: '#353638', dark: '#353638' })
    expect(tokens['--dsw-alias-button-info-fill']).toEqual({ light: '#7aaaff', dark: '#7aaaff' })
    expect(contrastRatio(
      tokens['--dsw-alias-button-info-fill']!.light,
      tokens['--dsw-specific-sidebar-nav-item-active-accent']!.light,
    )).toBeGreaterThanOrEqual(4.5)

    // Custom dark accent stays intact in dark mode while flipped light mode uses #7aaaff.
    const darkAccentOnly = buildTokenOverrides(full({
      backgroundImage: 'data:image/webp;base64,AAAA',
      imageDark: true,
      dark: { ...DEFAULT_DARK_THEME, accent: '#f48fb1' },
    }))
    expect(darkAccentOnly['--dsw-alias-button-info-fill']).toEqual({ light: '#7aaaff', dark: '#f48fb1' })

    // If light mode explicitly uses dark text, light keeps unflipped #61666b contrast-fill
    // while dark mode flips to #fafaf9.
    const lightCustomText = buildTokenOverrides(full({
      backgroundImage: 'data:image/webp;base64,AAAA',
      imageDark: true,
      light: { ...DEFAULT_LIGHT_THEME, text: '#111111' },
    }))
    expect(lightCustomText['--dsw-alias-button-contrast-fill']).toEqual({ light: '#61666b', dark: '#fafaf9' })
  })

  it('computes high-contrast global and user-bubble selection pairs across modes and custom palettes (Issue #46)', () => {
    // 1. Default settings: brand blue (#4176e6) with crisp white (#fafaf9) text in both global and user bubbles
    //    (fixes dark-mode `#fafaf9` on `#fafaf9` white-on-white user-bubble selection).
    const stock = selectionColors(full())
    expect(stock.global.light).toEqual({ bg: '#4176e6', fg: '#fafaf9' })
    expect(stock.global.dark).toEqual({ bg: '#4176e6', fg: '#fafaf9' })
    expect(stock.bubble.light).toEqual({ bg: '#4176e6', fg: '#fafaf9' })
    expect(stock.bubble.dark).toEqual({ bg: '#4176e6', fg: '#fafaf9' })
    expect(contrastRatio(stock.bubble.dark.bg, stock.bubble.dark.fg)).toBeGreaterThan(4.0)

    // 2. Light accent in dark mode (e.g. near-white `#fafaf9` or Monochrome `#b4b4b9`) flips selection text dark (`#0f1115`).
    const whiteAccentDark = selectionColors(full({
      dark: { ...DEFAULT_DARK_THEME, accent: '#fafaf9' },
    }))
    expect(whiteAccentDark.global.dark).toEqual({ bg: '#fafaf9', fg: '#0f1115' })
    expect(whiteAccentDark.bubble.dark).toEqual({ bg: '#fafaf9', fg: '#0f1115' })

    // 3. Light accent in light mode (`#fbbf24` on `#edf3fe` bubble): never black-on-black; falls back cleanly if close to bubble.
    const yellowLight = selectionColors(full({
      light: { ...DEFAULT_LIGHT_THEME, accent: '#fbbf24' },
    }))
    expect(yellowLight.global.light).toEqual({ bg: '#fbbf24', fg: '#0f1115' })
    expect(contrastRatio(yellowLight.bubble.light.bg, yellowLight.bubble.light.fg)).toBeGreaterThan(4.5)

    // 4. Same-hue blue panel/bubble (`#355eb6`) + blue accent (`#4176e6`): accent would disappear into bubble,
    //    so bubble selection automatically falls back to high-contrast inverted bubble ink (`#fafaf9` bg + `#0f1115` fg).
    const blueOnBlue = selectionColors(full({
      dark: { ...DEFAULT_DARK_THEME, accent: '#4176e6', panel: '#355eb6' },
    }))
    expect(blueOnBlue.global.dark).toEqual({ bg: '#4176e6', fg: '#fafaf9' })
    expect(blueOnBlue.bubble.dark).toEqual({ bg: '#fafaf9', fg: '#0f1115' })

    // 5. Transparent bubble (`surfaceAlpha: 0`) composites against `background` so contrast check reflects visible backdrop.
    const transparentOnBlueBg = selectionColors(full({
      surfaceAlpha: 0,
      dark: { ...DEFAULT_DARK_THEME, accent: '#2563eb', background: '#1e3a8a' },
    }))
    expect(transparentOnBlueBg.bubble.dark).toEqual({ bg: '#fafaf9', fg: '#0f1115' })

    // 6. Every shipped light and dark preset yields readable bubble and global selection pairs.
    for (const preset of LIGHT_PRESETS) {
      const sel = selectionColors(full({ light: { ...DEFAULT_LIGHT_THEME, ...preset.colors, preset: preset.id } }))
      expect(contrastRatio(sel.global.light.bg, sel.global.light.fg)).toBeGreaterThan(4.0)
      expect(contrastRatio(sel.bubble.light.bg, sel.bubble.light.fg)).toBeGreaterThan(4.0)
    }
    for (const preset of DARK_PRESETS) {
      const sel = selectionColors(full({ dark: { ...DEFAULT_DARK_THEME, ...preset.colors, preset: preset.id } }))
      expect(contrastRatio(sel.global.dark.bg, sel.global.dark.fg)).toBeGreaterThan(4.0)
      expect(contrastRatio(sel.bubble.dark.bg, sel.bubble.dark.fg)).toBeGreaterThan(4.0)
    }
  })

  it('bakes active page tab and markdown tag tokens at surfaceAlpha (including 0%) so active tabs never stay semi-transparent at rest and turn transparent on hover', () => {
    const allZero = buildTokenOverrides(full({
      surfaceAlpha: 0,
      sidebarAlpha: 0,
      modalAlpha: 0,
      inputAlpha: 0,
      codeAlpha: 0,
    }))
    expect(allZero['--dsw-alias-interactive-bg-active']).toEqual({
      light: 'rgba(235, 238, 242, 0)',
      dark: 'rgba(67, 69, 74, 0)',
    })
    expect(allZero['--dsw-alias-markdown-tag']).toEqual({
      light: 'rgba(241, 243, 245, 0)',
      dark: 'rgba(44, 44, 46, 0)',
    })
    expect(allZero['--dsw-alias-interactive-bg-hover']).toEqual({
      light: 'rgba(241, 243, 245, 0)',
      dark: 'rgba(53, 54, 56, 0)',
    })

    // Under dark wallpaper + translucency, no token ever contains NaN
    const darkMediaTranslucent = buildTokenOverrides(full({
      backgroundImage: 'data:image/webp;base64,AAAA',
      imageDark: true,
      surfaceAlpha: 0.4,
      sidebarAlpha: 0.4,
      inputAlpha: 0.4,
      codeAlpha: 0.4,
    }))
    for (const [name, pair] of Object.entries(darkMediaTranslucent)) {
      expect(pair.light, `${name}.light`).not.toContain('NaN')
      expect(pair.dark, `${name}.dark`).not.toContain('NaN')
    }
  })
})


describe('preset catalog', () => {
  it('every named preset defines all six role colors; default defines none', () => {
    for (const preset of APPEARANCE_PRESETS) {
      if (preset.id === 'default') {
        expect(Object.keys(preset.colors)).toHaveLength(0)
        continue
      }
      expect(Object.keys(preset.colors)).toHaveLength(6)
    }
  })

  it('LIGHT_PRESETS and DARK_PRESETS each have default and 5 distinct themes', () => {
    expect(LIGHT_PRESETS).toHaveLength(6)
    expect(DARK_PRESETS).toHaveLength(6)
    expect(LIGHT_PRESETS.map(p => p.id)).toEqual(['default', 'dawn', 'sky', 'mint', 'sakura', 'clay'])
    expect(DARK_PRESETS.map(p => p.id)).toEqual(['default', 'midnight', 'ocean', 'forest', 'rose', 'monochrome'])
  })
})

describe('boundary constants', () => {
  it('match the schema bounds', () => {
    expect(BACKGROUND_BLUR_MAX).toBe(30)
    expect(GLASS_BLUR_MAX).toBe(20)
    expect(OVERRIDE_SOURCE).toBe('@deepseek-ai/dsh-client-ui-appearance')
  })
})
