/** Persistence sanitizer: schema validation and clamping of stored settings. */
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_BLUR_MAX, DEFAULT_SETTINGS, EMPHASIS_ALPHA_MAX, sanitizeSettings,
} from '../src/appearance-settings.ts'

describe('sanitizeSettings', () => {
  it('returns the defaults for a non-object input', () => {
    for (const raw of [null, undefined, 'nope', 42, [], true]) {
      expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('keeps a complete valid section untouched', () => {
    const valid = {
      ...DEFAULT_SETTINGS,
      accent: '#4176e6', text: '#111111',
      backgroundOpacity: 0.5, backgroundBlur: 12, scrim: 0.4, surfaceAlpha: 0.8, glassBlur: 8,
      sidebarOpaque: true, preset: 'midnight',
    }
    expect(sanitizeSettings(valid)).toEqual(valid)
  })

  it('drops invalid role colors and normalizes case', () => {
    const sanitized = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      accent: '#FFAA00', background: 'not-a-color', panel: '#abc', text: 42,
    })
    expect(sanitized.accent).toBe('#ffaa00')
    expect(sanitized.panel).toBe('#aabbcc')
    expect(sanitized.background).toBe('')
    expect(sanitized.text).toBe('')
  })

  it('clamps numbers to the schema bounds', () => {
    const sanitized = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      backgroundOpacity: 5, scrim: -1, surfaceAlpha: Number.NaN,
      backgroundBlur: 999, glassBlur: -3, emphasisAlpha: 9,
    })
    expect(sanitized.backgroundOpacity).toBe(1)
    expect(sanitized.scrim).toBe(0)
    expect(sanitized.surfaceAlpha).toBe(DEFAULT_SETTINGS.surfaceAlpha)
    expect(sanitized.backgroundBlur).toBe(BACKGROUND_BLUR_MAX)
    expect(sanitized.glassBlur).toBe(0)
    expect(sanitized.emphasisAlpha).toBe(EMPHASIS_ALPHA_MAX)
  })

  it('rejects non-number numerics instead of feeding them into CSS', () => {
    const sanitized = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      backgroundBlur: '30px', glassBlur: '8', backgroundOpacity: '0.5',
    })
    expect(sanitized.backgroundBlur).toBe(DEFAULT_SETTINGS.backgroundBlur)
    expect(sanitized.glassBlur).toBe(DEFAULT_SETTINGS.glassBlur)
    expect(sanitized.backgroundOpacity).toBe(DEFAULT_SETTINGS.backgroundOpacity)
  })

  it('coerces legacy 1/0 booleans to real booleans', () => {
    const sanitized = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      sidebarOpaque: 1, imageDark: 0,
    })
    expect(sanitized.sidebarOpaque).toBe(true)
    expect(sanitized.imageDark).toBe(false)
  })

  it('drops unknown fields and keeps known strings', () => {
    const sanitized = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      backgroundImage: 'data:image/png;base64,AAAA',
      backgroundVideo: 'key-1', preset: 'ocean', hackerField: 'x',
    })
    expect(sanitized.backgroundImage).toBe('data:image/png;base64,AAAA')
    expect(sanitized.backgroundVideo).toBe('key-1')
    expect(sanitized.preset).toBe('ocean')
    expect('hackerField' in sanitized).toBe(false)
  })
})
