/** Appearance customization settings persisted in localStorage. */

/** Settings namespace owned by the appearance plugin (kept for the record). */
export const APPEARANCE_SETTINGS_NAMESPACE = 'ui-appearance'

/** Max background image blur in px (schema bound). */
export const BACKGROUND_BLUR_MAX = 30

/** Max glass backdrop blur in px (schema bound). */
export const GLASS_BLUR_MAX = 20

/** Max emphasized-text tint alpha (schema bound for the inline-code chips). */
export const EMPHASIS_ALPHA_MAX = 0.45

/** Min emphasized-text tint alpha; 0 = no chip background at all. */
export const EMPHASIS_ALPHA_MIN = 0

/**
 * The color roles the customizer exposes. Each role maps to one or more
 * `--dsw-alias-*` tokens; an empty string means "keep the stock token".
 * Bubble roles were removed: the harness renders its only bubble background
 * on user messages (assistant turns have none), so bubbles now follow the
 * accent color instead of owning separate settings.
 */
export const APPEARANCE_ROLES = [
  'accent',
  'background',
  'panel',
  'input',
  'text',
  'border',
] as const

/** One customizable color role id. */
export type AppearanceRole = typeof APPEARANCE_ROLES[number]

/** Hex color fields, keyed by role. */
export type AppearanceColors = Record<AppearanceRole, string>

/**
 * Durable appearance section. Color fields hold `#rrggbb` or `''` (stock);
 * the image field holds a compressed data URL or `''`; the numeric fields are
 * plain percentages/px values with their stock value as the default.
 */
export interface AppearanceSettings extends AppearanceColors {
  /** Compressed background image data URL; '' clears the image. */
  backgroundImage: string
  /** IndexedDB key of the background video; '' clears the video. */
  backgroundVideo: string
  /** True when the compressed image sampled as dark (< 35% average brightness). */
  imageDark: boolean
  /** Background image layer opacity, 0..1. */
  backgroundOpacity: number
  /** Background image blur in px, 0..30. */
  backgroundBlur: number
  /** Readability scrim over the background image, 0..1 (0 = no veil). */
  scrim: number
  /** UI surface opacity, 0..1 (1 = fully opaque surfaces). */
  surfaceAlpha: number
  /** Composer input opacity, 0..1; 1 = follow surfaceAlpha. */
  inputAlpha: number
  /** Code block / inline code opacity, 0..1; 1 = follow surfaceAlpha. */
  codeAlpha: number
  /** Keep the sidebar fill opaque even when surfaceAlpha is below 1. */
  sidebarOpaque: boolean
  /** Glass blur in px added to the wallpaper blur, 0..20 (0 = no extra blur). */
  glassBlur: number
  /** Tint alpha of emphasized text chips (inline code), 0..0.45. */
  emphasisAlpha: number
  /** Last applied preset id, or 'custom' after manual edits. */
  preset: string
}

/** The section with every color role left stock and every effect off. */
export const DEFAULT_SETTINGS: AppearanceSettings = {
  accent: '',
  background: '',
  panel: '',
  input: '',
  text: '',
  border: '',
  backgroundImage: '',
  backgroundVideo: '',
  imageDark: false,
  backgroundOpacity: 1,
  backgroundBlur: 0,
  scrim: 0,
  surfaceAlpha: 1,
  inputAlpha: 1,
  codeAlpha: 1,
  sidebarOpaque: false,
  glassBlur: 0,
  emphasisAlpha: 0.22,
  preset: '',
}

/** Number fields and their schema bounds, used to sanitize persisted input. */
const NUMERIC_BOUNDS: Record<string, { min: number; max: number }> = {
  backgroundOpacity: { min: 0, max: 1 },
  backgroundBlur: { min: 0, max: BACKGROUND_BLUR_MAX },
  scrim: { min: 0, max: 1 },
  surfaceAlpha: { min: 0, max: 1 },
  inputAlpha: { min: 0, max: 1 },
  codeAlpha: { min: 0, max: 1 },
  glassBlur: { min: 0, max: GLASS_BLUR_MAX },
  emphasisAlpha: { min: EMPHASIS_ALPHA_MIN, max: EMPHASIS_ALPHA_MAX },
}

/** Boolean fields, used to sanitize persisted input. */
const BOOLEAN_FIELDS = ['imageDark', 'sidebarOpaque'] as const

/** Canonicalize a hex color: lowercase, 3-digit expanded to 6-digit. */
function normalizeHex(value: string): string {
  if (value.length === 4) {
    const [, r, g, b] = value
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return value.toLowerCase()
}

/**
 * Validate and coerce one parsed settings document against the schema, so
 * hand-edited or stale localStorage can never produce invalid CSS (e.g. a
 * string blur feeding `${value}px` or an alpha outside 0..1). Unknown fields
 * are dropped; every field that fails its check falls back to the default.
 * Legacy persisted `1`/`0` booleans (older checkbox writes) are coerced to
 * real booleans so existing users keep their settings.
 * @param raw - the parsed localStorage section, or any foreign value.
 * @returns a complete, schema-valid settings section.
 */
export function sanitizeSettings(raw: unknown): AppearanceSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS }
  const source = raw as Record<string, unknown>
  const result: AppearanceSettings = { ...DEFAULT_SETTINGS }
  for (const role of APPEARANCE_ROLES) {
    const value = source[role]
    if (typeof value === 'string' && (value === '' || /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value))) {
      result[role] = value === '' ? '' : normalizeHex(value)
    }
  }
  const strings: Array<keyof AppearanceSettings> = ['backgroundImage', 'backgroundVideo', 'preset']
  const index = result as unknown as Record<string, string | number | boolean>
  for (const field of strings) {
    const value = source[field]
    // Union-keyed writes intersect to never; write through an index view.
    if (typeof value === 'string') index[field] = value
  }
  for (const [field, { min, max }] of Object.entries(NUMERIC_BOUNDS)) {
    const value = source[field]
    if (typeof value === 'number' && Number.isFinite(value)) {
      index[field] = Math.min(max, Math.max(min, value))
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    const value = source[field]
    if (typeof value === 'boolean') result[field] = value
    else if (value === 0) result[field] = false
    else if (value === 1) result[field] = true
  }
  return result
}
