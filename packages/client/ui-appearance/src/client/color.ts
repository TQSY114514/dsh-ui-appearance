/**
 * Pure hex color helpers for the appearance customizer: parsing, formatting,
 * mixing against a mode base, and translucent rgba output. No DOM access.
 */

/** An rgb triple with 0..255 channels. */
export interface Rgb {
  /** Red channel, 0..255. */
  r: number
  /** Green channel, 0..255. */
  g: number
  /** Blue channel, 0..255. */
  b: number
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Validate a user-typed hex color.
 * @param value - candidate `#rgb` or `#rrggbb` string.
 * @returns whether the value is a valid hex color.
 */
export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

/**
 * Parse a hex color to rgb channels.
 * @param value - `#rgb` or `#rrggbb` string.
 * @returns the parsed channels.
 */
export function parseHex(value: string): Rgb {
  const hex = value.slice(1)
  if (hex.length === 3) {
    const first = hex.slice(0, 1)
    return {
      r: parseInt(first + first, 16),
      g: parseInt(hex.slice(1, 2) + hex.slice(1, 2), 16),
      b: parseInt(hex.slice(2, 3) + hex.slice(2, 3), 16),
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

/**
 * Format rgb channels back to a canonical lowercase `#rrggbb` string.
 * @param channels - the rgb channels to format.
 * @returns the hex color string.
 */
export function formatHex(channels: Rgb): string {
  const to = (channel: number): string => channel.toString(16).padStart(2, '0')
  return `#${to(channels.r)}${to(channels.g)}${to(channels.b)}`
}

/**
 * Mix a color toward a base by weight: `weight = 0` returns the color,
 * `weight = 1` returns the base.
 * @param value - source hex color.
 * @param base - target hex color.
 * @param weight - 0..1 fraction of the base in the result.
 * @returns the mixed hex color.
 */
export function mixHex(value: string, base: string, weight: number): string {
  const from = parseHex(value)
  const to = parseHex(base)
  const channel = (a: number, b: number): number => Math.round(a + (b - a) * weight)
  return formatHex({ r: channel(from.r, to.r), g: channel(from.g, to.g), b: channel(from.b, to.b) })
}

/**
 * Render a hex color with an alpha channel as an rgba() string.
 * @param value - `#rgb` or `#rrggbb` string.
 * @param alpha - 0..1 opacity.
 * @returns the rgba() CSS color.
 */
export function withAlpha(value: string, alpha: number): string {
  const { r, g, b } = parseHex(value)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
