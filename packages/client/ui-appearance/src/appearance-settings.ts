/** Appearance customization settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the appearance plugin. */
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
  imageDark: false,
  backgroundOpacity: 1,
  backgroundBlur: 0,
  scrim: 0,
  surfaceAlpha: 1,
  glassBlur: 0,
  preset: '',
}

/** Durable appearance schema; also the wire envelope the browser scope validates against. */
export const AppearanceSettingsSchema: z<AppearanceSettings> = z.object({
  accent: z.string().default(''),
  background: z.string().default(''),
  panel: z.string().default(''),
  input: z.string().default(''),
  text: z.string().default(''),
  border: z.string().default(''),
  userBubble: z.string().default(''),
  assistantBubble: z.string().default(''),
  backgroundImage: z.string().default(''),
  imageDark: z.boolean().default(false),
  backgroundOpacity: z.number().min(0).max(1).default(1),
  backgroundBlur: z.number().min(0).max(30).default(0),
  scrim: z.number().min(0).max(1).default(0),
  surfaceAlpha: z.number().min(0).max(1).default(1),
  glassBlur: z.number().min(0).max(20).default(0),
  preset: z.string().default(''),
})
