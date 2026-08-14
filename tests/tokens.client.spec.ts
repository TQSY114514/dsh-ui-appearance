/** Token override builder and preset catalog. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import {
  APPEARANCE_PRESETS, BACKGROUND_BLUR_MAX, buildTokenOverrides, GLASS_BLUR_MAX, OVERRIDE_SOURCE,
} from '../src/client/tokens.ts'

const full = (partial: Partial<AppearanceSettings> = {}): AppearanceSettings => ({ ...DEFAULT_SETTINGS, ...partial })

describe('buildTokenOverrides', () => {
  it('emits nothing for the stock settings', () => {
    expect(buildTokenOverrides(full())).toEqual({})
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

  it('maps background to the base and derived layer tokens', () => {
    const tokens = buildTokenOverrides(full({ background: '#8899aa' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#8899aa', dark: '#8899aa' })
    expect(tokens['--dsw-alias-bg-layer-1']!.light).not.toBe(tokens['--dsw-alias-bg-layer-1']!.dark)
    // Derived sidebar fill exists when panel is unset.
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('panel wins the layer-1 and sidebar tokens', () => {
    const tokens = buildTokenOverrides(full({ background: '#8899aa', panel: '#203040' }))
    expect(tokens['--dsw-alias-bg-layer-1']).toEqual({ light: '#203040', dark: '#203040' })
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('maps text, border, and bubble roles to their token groups', () => {
    const tokens = buildTokenOverrides(full({
      text: '#111111', border: '#333333', userBubble: '#3a4674', assistantBubble: '#262b3f',
    }))
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#111111', dark: '#111111' })
    expect(tokens['--dsw-alias-label-secondary']).toBeDefined()
    expect(tokens['--dsw-alias-border-l1']).toEqual({ light: '#333333', dark: '#333333' })
    expect(tokens['--dsw-specific-bubble-highlight']).toEqual({ light: '#3a4674', dark: '#3a4674' })
    expect(tokens['--dsw-specific-bubble']).toEqual({ light: '#262b3f', dark: '#262b3f' })
  })

  it('turns the surface tokens translucent below full opacity', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418', surfaceAlpha: 0.6 }))
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
    for (const value of Object.values(tokens)) expect(value.light).not.toContain('rgba(')
  })

  it('translucency with every role color empty falls back to the stock palette', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 0.6 }))
    expect(Object.keys(tokens).length).toBeGreaterThan(0)
    for (const value of Object.values(tokens)) {
      // Every translucent value must be a valid rgba() (never a var() or
      // color-mix: referencing the token itself would cycle and turn the
      // surface fully transparent — the 0%/100%-only regression).
      expect(value.light).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/)
    }
    // Stock light-mode base becomes translucent white.
    expect(tokens['--dsw-alias-bg-base']!.light).toBe('rgba(255, 255, 255, 0.6)')
    // Stock dark-mode base becomes translucent near-black.
    expect(tokens['--dsw-alias-bg-base']!.dark).toBe('rgba(21, 21, 23, 0.6)')
  })

  it('translucent surfaces follow the dark-flip derived colors', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418', surfaceAlpha: 0.5 }))
    // #101418 is dark -> flip lifts layer-1 to mix(#101418, white, 0.06) = rgb(30, 34, 38).
    expect(tokens['--dsw-alias-bg-layer-1']!.light).toBe('rgba(30, 34, 38, 0.5)')
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('neutral buttons follow the surface translucency; brand buttons stay solid', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 0.6 }))
    expect(tokens['--dsw-alias-button-elevated-fill']!.light).toBe('rgba(255, 255, 255, 0.6)')
    expect(tokens['--dsw-alias-button-floating-fill']).toBeDefined()
    expect(tokens['--dsw-alias-button-floating-hover']).toBeDefined()
    // Primary action buttons (brand fill) are not translucenced.
    expect(tokens['--dsw-alias-brand-primary']).toBeUndefined()
  })

  it('settings surfaces (selected nav tab, menus) follow the translucency too', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 0.5 }))
    expect(tokens['--dsw-specific-sidebar-nav-item-active']!.light).toBe('rgba(235, 238, 242, 0.5)')
    expect(tokens['--dsw-specific-sidebar-nav-item-hover']!.light).toBe('rgba(241, 243, 245, 0.5)')
    expect(tokens['--dsw-specific-menu']).toBeDefined()
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

  it('a dark user background flips the whole surface family together', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418' }))
    // Layers lift from the dark base so cards stay distinguishable.
    const layer1 = tokens['--dsw-alias-bg-layer-1']!
    expect(layer1.light).toBe(layer1.dark)
    expect(layer1.light).not.toBe('#101418')
    // Labels flip light so text on the dark base stays readable.
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
    expect(tokens['--dsw-alias-label-secondary']).toEqual({ light: '#d6d3d1', dark: '#d6d3d1' })
    // Buttons follow the darkened surface instead of staying white.
    expect(tokens['--dsw-alias-button-elevated-fill']).toEqual({ light: 'rgb(67, 69, 74)', dark: 'rgb(67, 69, 74)' })
    expect(tokens['--dsw-alias-button-floating-fill']).toEqual({ light: 'rgb(44, 44, 46)', dark: 'rgb(44, 44, 46)' })
  })

  it('a light user background leaves the surface family alone', () => {
    const tokens = buildTokenOverrides(full({ background: '#d0d0d0' }))
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
  })

  it('a dark image (imageDark) flips the family from the dark base', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
    const layer1 = tokens['--dsw-alias-bg-layer-1']!
    expect(layer1.light).not.toBe('#151517')
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#fafaf9', dark: '#fafaf9' })
  })

  it('a bright image (no imageDark) flips nothing beyond the transparent base', () => {
    const tokens = buildTokenOverrides(full({ backgroundImage: 'data:image/webp;base64,AAAA' }))
    expect(tokens['--dsw-alias-label-primary']).toBeUndefined()
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeUndefined()
  })

  it('an explicit text color wins over the flipped labels', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418', text: '#111111' }))
    expect(tokens['--dsw-alias-label-primary']).toEqual({ light: '#111111', dark: '#111111' })
    // Buttons still follow the darkened surface.
    expect(tokens['--dsw-alias-button-elevated-fill']).toBeDefined()
  })
})

describe('preset catalog', () => {
  it('every named preset defines all eight role colors; default defines none', () => {
    for (const preset of APPEARANCE_PRESETS) {
      if (preset.id === 'default') {
        expect(Object.keys(preset.colors)).toHaveLength(0)
        continue
      }
      expect(Object.keys(preset.colors)).toHaveLength(8)
    }
  })
})

describe('boundary constants', () => {
  it('match the schema bounds', () => {
    expect(BACKGROUND_BLUR_MAX).toBe(30)
    expect(GLASS_BLUR_MAX).toBe(20)
    expect(OVERRIDE_SOURCE).toBe('@deepseek-ai/dsh-client-ui-appearance')
  })
})
