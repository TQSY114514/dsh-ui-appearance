/** Color scheme export/import: JSON format, validation, unknown-role tolerance. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import { exportColorScheme, parseColorScheme } from '../src/client/color-scheme.ts'

const full = (partial: Partial<AppearanceSettings> = {}): AppearanceSettings => ({ ...DEFAULT_SETTINGS, ...partial })

describe('exportColorScheme', () => {
  it('carries every role color in a versioned envelope', () => {
    const settings = full({ accent: '#4176e6', background: '#101418', preset: 'midnight' })
    const parsed = JSON.parse(exportColorScheme(settings)) as {
      version: number
      colors: Record<string, string>
    }
    expect(parsed.version).toBe(1)
    expect(parsed.colors.accent).toBe('#4176e6')
    expect(parsed.colors.background).toBe('#101418')
    expect(Object.keys(parsed.colors)).toHaveLength(6)
    // Sliders and the image are not part of a color scheme.
    expect(parsed.colors.backgroundImage).toBeUndefined()
  })

  it('exports both light and dark mode colors when customized', () => {
    const settings = full({
      light: { accent: '#d97706', background: '#fbfaf8', panel: '#f4f1ea', input: '#ffffff', text: '#292524', border: '#e7e5e4', preset: 'dawn' },
      dark: { accent: '#7c9cff', background: '#1b1e2c', panel: '#232737', input: '#202435', text: '#e6e9f4', border: '#343a52', preset: 'midnight' },
    })
    const parsed = JSON.parse(exportColorScheme(settings)) as {
      version: number
      colors: Record<string, string>
      light?: Record<string, string>
      dark?: Record<string, string>
    }
    expect(parsed.light?.accent).toBe('#d97706')
    expect(parsed.light?.background).toBe('#fbfaf8')
    expect(parsed.dark?.accent).toBe('#7c9cff')
    expect(parsed.dark?.background).toBe('#1b1e2c')
  })
})

describe('parseColorScheme', () => {
  it('accepts a valid scheme and returns the role colors', () => {
    const colors = parseColorScheme(JSON.stringify({
      version: 1,
      colors: { accent: '#4176e6', background: '', panel: '#203040' },
    }))
    expect(colors.accent).toBe('#4176e6')
    expect(colors.background).toBe('')
    expect(colors.panel).toBe('#203040')
  })

  it('accepts dual-mode scheme with light and dark sub-sections', () => {
    const result = parseColorScheme(JSON.stringify({
      version: 1,
      light: { accent: '#d97706', background: '#fbfaf8' },
      dark: { accent: '#7c9cff', background: '#1b1e2c' },
    }))
    expect(result.light?.accent).toBe('#d97706')
    expect(result.light?.background).toBe('#fbfaf8')
    expect(result.dark?.accent).toBe('#7c9cff')
    expect(result.dark?.background).toBe('#1b1e2c')
  })

  it('ignores unknown roles', () => {
    const colors = parseColorScheme(JSON.stringify({
      version: 1,
      colors: { accent: '#4176e6', nonsense: '#000000' },
    })) as Record<string, string>
    expect(colors.accent).toBe('#4176e6')
    expect(colors.nonsense).toBeUndefined()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseColorScheme('{not json')).toThrow(/JSON/)
  })

  it('rejects a non-object root or colors', () => {
    expect(() => parseColorScheme('[1,2]')).toThrow(/root/)
    expect(() => parseColorScheme('{"version":1,"colors":"x"}')).toThrow(/colors/)
  })

  it('rejects an invalid role color value', () => {
    expect(() => parseColorScheme(JSON.stringify({ version: 1, colors: { accent: 'red' } })))
      .toThrow(/invalid color/)
  })
})
