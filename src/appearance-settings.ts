/** Appearance customization settings persisted in localStorage. */

/** Settings namespace owned by the appearance plugin (kept for the record). */
export const APPEARANCE_SETTINGS_NAMESPACE = 'ui-appearance'

/**
 * The color roles the customizer exposes. Each role maps to one or more
 * `--dsw-alias-*` tokens; an empty string means "keep the stock token".
 */
export const APPEARANCE_ROLES = [
  'accent',
  'background',
  'panel',
  'input',
  'text',
  'border',
  'userBubble',
  'assistantBubble',
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
  /** Keep the sidebar fill opaque even when surfaceAlpha is below 1. */
  sidebarOpaque: boolean
  /** Glass backdrop blur in px, 0..20 (0 = no backdrop-filter). */
  glassBlur: number
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
  userBubble: '',
  assistantBubble: '',
  backgroundImage: '',
  backgroundVideo: '',
  imageDark: false,
  backgroundOpacity: 1,
  backgroundBlur: 0,
  scrim: 0,
  surfaceAlpha: 1,
  sidebarOpaque: false,
  glassBlur: 0,
  preset: '',
}
