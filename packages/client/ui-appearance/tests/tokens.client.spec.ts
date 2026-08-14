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
    const tokens = buildTokenOverrides(full({ background: '#101418' }))
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: '#101418', dark: '#101418' })
    expect(tokens['--dsw-alias-bg-layer-1']!.light).not.toBe(tokens['--dsw-alias-bg-layer-1']!.dark)
    // Derived sidebar fill exists when panel is unset.
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('panel wins the layer-1 and sidebar tokens', () => {
    const tokens = buildTokenOverrides(full({ background: '#101418', panel: '#203040' }))
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
    expect(base.light).toContain('color-mix(in srgb,')
    expect(base.light).toContain('60%')
    expect(tokens['--dsw-specific-sidebar-fill']).toBeDefined()
    expect(tokens['--dsw-specific-input-major']).toBeDefined()
    expect(tokens['--dsw-specific-bubble']).toBeDefined()
  })

  it('stays opaque at full surface opacity', () => {
    const tokens = buildTokenOverrides(full({ surfaceAlpha: 1 }))
    for (const value of Object.values(tokens)) expect(value.light).not.toContain('color-mix')
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
