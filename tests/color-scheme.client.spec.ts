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
    expect(Object.keys(parsed.colors)).toHaveLength(8)
    // Sliders and the image are not part of a color scheme.
    expect(parsed.colors.backgroundImage).toBeUndefined()
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
