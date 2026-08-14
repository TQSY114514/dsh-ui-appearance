/** Pure hex color helpers. */
import { describe, expect, it } from 'vitest'
import { formatHex, isHexColor, mixHex, parseHex, withAlpha } from '../src/client/color.ts'

describe('isHexColor', () => {
  it('accepts 3- and 6-digit hex with or without leading hash formality', () => {
    expect(isHexColor('#abc')).toBe(true)
    expect(isHexColor('#aabbcc')).toBe(true)
    expect(isHexColor('#ABC')).toBe(true)
    expect(isHexColor('#ABCDEF')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isHexColor('')).toBe(false)
    expect(isHexColor('#ab')).toBe(false)
    expect(isHexColor('#1234')).toBe(false)
    expect(isHexColor('#ggg')).toBe(false)
    expect(isHexColor('aabbcc')).toBe(false)
  })
})

describe('parseHex', () => {
  it('expands 3-digit hex to full channels', () => {
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 })
    expect(parseHex('#000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('parses 6-digit hex', () => {
    expect(parseHex('#102030')).toEqual({ r: 16, g: 32, b: 48 })
  })
})

describe('formatHex', () => {
  it('round-trips parsed channels into lowercase 6-digit hex', () => {
    expect(formatHex({ r: 16, g: 32, b: 48 })).toBe('#102030')
    expect(formatHex(parseHex('#Ff0A11'))).toBe('#ff0a11')
  })
})

describe('mixHex', () => {
  it('returns the source at weight 0 and the base at weight 1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('mixes halfway between black and white', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('mixes channels independently', () => {
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080')
  })
})

describe('withAlpha', () => {
  it('renders an rgba() string from a hex color', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(withAlpha('#00f', 1)).toBe('rgba(0, 0, 255, 1)')
  })
})
