/**
 * Role → `--dsw-alias-*` token override computation and the shipped presets.
 * The theme service requires `{ light, dark }` pairs per token, so every
 * derived value is computed twice, once against the light mode base and once
 * against the dark mode base; role colors themselves repeat in both modes
 * (one user color serves both palettes).
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceRole, AppearanceSettings } from '../appearance-settings.ts'
import { isDarkColor, mixHex } from './color.ts'

/** Override-layer source name pinned to this package (also names inspection). */
export const OVERRIDE_SOURCE = '@deepseek-ai/dsh-client-ui-appearance'

/** Mode base a derived step mixes toward: light mixes toward white. */
const LIGHT_BASE = '#ffffff'
/** Mode base a derived step mixes toward: dark mixes toward near-black. */
const DARK_BASE = '#151517'

/** Max glass backdrop blur in px (schema bound). */
export const GLASS_BLUR_MAX = 20

/** Max background image blur in px (schema bound). */
export const BACKGROUND_BLUR_MAX = 30

/**
 * Compute the full override layer for one settings snapshot. Every role with
 * a non-empty color contributes its token group; a surfaceAlpha below 1 turns
 * the major surface tokens translucent. Returns an empty object when nothing
 * is customized, which removes the override layer entirely.
 * @param settings - current appearance settings.
 * @returns token-name → per-mode value pairs.
 */
export function buildTokenOverrides(settings: AppearanceSettings): ThemeTokenOverrides {
  const tokens: ThemeTokenOverrides = {}
  const emit = (name: string, light: string, dark: string): void => {
    tokens[name] = { light, dark }
  }
  const modePair = (value: string): [string, string] => [value, value]
  const step = (value: string, weight: number): [string, string] =>
    [mixHex(value, LIGHT_BASE, weight), mixHex(value, DARK_BASE, weight)]

  const { accent, background, panel, input, text, border, userBubble, assistantBubble, backgroundImage, imageDark, surfaceAlpha } = settings

  if (accent !== '') {
    const [light, dark] = modePair(accent)
    emit('--dsw-alias-brand-primary', light, dark)
    // Deliberately NOT overriding --dsw-alias-brand-text: it is the ink ON
    // the brand fill (label-primary-foreground drives buttons), and painting
    // it the accent color makes on-brand text unreadable.
    emit('--dsw-alias-state-business-primary', light, dark)
    emit('--dsw-alias-button-info-fill', light, dark)
    const [hoverLight, hoverDark] = step(accent, 0.15)
    emit('--dsw-alias-button-info-hover', hoverLight, hoverDark)
    const [primaryHoverLight, primaryHoverDark] = step(accent, 0.22)
    emit('--dsw-alias-button-primary-hover', primaryHoverLight, primaryHoverDark)
  }

  if (background !== '') {
    const [light, dark] = modePair(background)
    emit('--dsw-alias-bg-base', light, dark)
    const [l1l, l1d] = step(background, 0.04)
    emit('--dsw-alias-bg-layer-1', l1l, l1d)
    const [l2l, l2d] = step(background, 0.08)
    emit('--dsw-alias-bg-layer-2', l2l, l2d)
    const [l3l, l3d] = step(background, 0.14)
    emit('--dsw-alias-bg-layer-3', l3l, l3d)
    const [modl, modd] = step(background, 0.06)
    emit('--dsw-alias-bg-module-platform', modl, modd)
    const [ovl, ovd] = step(background, 0.18)
    emit('--dsw-alias-bg-overlay', ovl, ovd)
    if (panel === '') {
      const [sideL, sideD] = step(background, 0.05)
      emit('--dsw-specific-sidebar-fill', sideL, sideD)
    }
  }

  if (panel !== '') {
    const [light, dark] = modePair(panel)
    emit('--dsw-alias-bg-layer-1', light, dark)
    const [l2l, l2d] = step(panel, 0.08)
    emit('--dsw-alias-bg-layer-2', l2l, l2d)
    const [l3l, l3d] = step(panel, 0.14)
    emit('--dsw-alias-bg-layer-3', l3l, l3d)
    const [ovl, ovd] = step(panel, 0.1)
    emit('--dsw-alias-bg-overlay', ovl, ovd)
    const [modl, modd] = step(panel, 0.06)
    emit('--dsw-alias-bg-module-platform', modl, modd)
    const [sideL, sideD] = step(panel, 0.04)
    emit('--dsw-specific-sidebar-fill', sideL, sideD)
  }

  if (input !== '') {
    const [light, dark] = modePair(input)
    emit('--dsw-specific-input-major', light, dark)
    const [loginL, loginD] = step(input, 0.06)
    emit('--dsw-specific-login-input', loginL, loginD)
  }

  if (text !== '') {
    const [light, dark] = modePair(text)
    emit('--dsw-alias-label-primary', light, dark)
    const [secL, secD] = step(text, 0.38)
    emit('--dsw-alias-label-secondary', secL, secD)
    const [terL, terD] = step(text, 0.58)
    emit('--dsw-alias-label-tertiary', terL, terD)
  }

  if (border !== '') {
    const [light, dark] = modePair(border)
    emit('--dsw-alias-border-l1', light, dark)
    emit('--dsw-alias-border-l2', light, dark)
    const [l3l, l3d] = step(border, 0.3)
    emit('--dsw-alias-border-l3', l3l, l3d)
  }

  if (userBubble !== '') {
    const [light, dark] = modePair(userBubble)
    emit('--dsw-specific-bubble-highlight', light, dark)
  }

  if (assistantBubble !== '') {
    const [light, dark] = modePair(assistantBubble)
    emit('--dsw-specific-bubble', light, dark)
  }

  // A background image makes the base canvas transparent so the wallpaper
  // layer shows through; surfaces stay opaque unless the image (or a dark
  // user background color) triggers the dark-family flip below.
  if (backgroundImage !== '') {
    emit('--dsw-alias-bg-base', 'transparent', 'transparent')
  }

  // Dark-family coordinated flip: a dark wallpaper or a dark user background
  // color demands the whole surface family adapt together — layers lift so
  // cards stay distinguishable, the sidebar fill follows, labels flip light
  // so text stays readable, and buttons follow the darkened surface instead
  // of staying white (white button + light ink = unreadable). An explicit
  // user text color still wins over the flipped labels.
  const flipBase = backgroundImage !== ''
    ? (imageDark ? '#151517' : undefined)
    : (background !== '' && isDarkColor(background) ? background : undefined)
  if (flipBase !== undefined) {
    const lighten = (weight: number): [string, string] => {
      const value = mixHex(flipBase, LIGHT_BASE, weight)
      return [value, value]
    }
    const [l1l, l1d] = lighten(0.06)
    emit('--dsw-alias-bg-layer-1', l1l, l1d)
    const [l2l, l2d] = lighten(0.12)
    emit('--dsw-alias-bg-layer-2', l2l, l2d)
    const [sideL, sideD] = lighten(0.03)
    emit('--dsw-specific-sidebar-fill', sideL, sideD)
    if (text === '') {
      emit('--dsw-alias-label-primary', '#fafaf9', '#fafaf9')
      emit('--dsw-alias-label-secondary', '#d6d3d1', '#d6d3d1')
    }
    emit('--dsw-alias-button-elevated-fill', 'rgb(67, 69, 74)', 'rgb(67, 69, 74)')
    emit('--dsw-alias-button-floating-fill', 'rgb(44, 44, 46)', 'rgb(44, 44, 46)')
    emit('--dsw-alias-button-floating-hover', 'rgb(53, 54, 56)', 'rgb(53, 54, 56)')
  }

  if (surfaceAlpha < 1) {
    const alpha = surfaceAlpha
    const translucent = (hex: string | undefined, token: string): void => {
      // A known role color is baked in; otherwise resolve the token's own
      // (possibly overridden) value at runtime. Empty-string roles mean
      // "keep the stock token", so they must fall through to var() too —
      // baking '' into color-mix would produce invalid CSS.
      const source = hex !== undefined && hex !== '' ? hex : `var(${token})`
      const value = `color-mix(in srgb, ${source} ${Math.round(alpha * 100)}%, transparent)`
      emit(token, value, value)
    }
    // An image keeps the base transparent even under surface translucency.
    translucent(backgroundImage !== '' ? 'transparent' : background, '--dsw-alias-bg-base')
    translucent(panel, '--dsw-alias-bg-layer-1')
    translucent(undefined, '--dsw-alias-bg-layer-2')
    translucent(undefined, '--dsw-alias-bg-layer-3')
    translucent(undefined, '--dsw-alias-bg-overlay')
    translucent(undefined, '--dsw-alias-bg-module-platform')
    translucent(panel ?? background, '--dsw-specific-sidebar-fill')
    translucent(input, '--dsw-specific-input-major')
    translucent(userBubble, '--dsw-specific-bubble-highlight')
    translucent(assistantBubble, '--dsw-specific-bubble')
  }

  return tokens
}

/** One shipped preset: a starter set of role colors. */
export interface AppearancePreset {
  /** Preset id (persisted in the `preset` field). */
  id: string
  /** Role colors; absent roles keep the user's current value. */
  colors: Partial<Record<AppearanceRole, string>>
}

/** The shipped presets; `default` clears every role color. */
export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  { id: 'default', colors: {} },
  {
    id: 'midnight',
    colors: {
      accent: '#7c9cff',
      background: '#1b1e2c',
      panel: '#232737',
      input: '#202435',
      text: '#e6e9f4',
      border: '#343a52',
      userBubble: '#3a4674',
      assistantBubble: '#262b3f',
    },
  },
  {
    id: 'ocean',
    colors: {
      accent: '#4fc3f7',
      background: '#0c2231',
      panel: '#12303f',
      input: '#0f2a38',
      text: '#e1f1fa',
      border: '#1e455c',
      userBubble: '#0f526f',
      assistantBubble: '#123b4e',
    },
  },
  {
    id: 'forest',
    colors: {
      accent: '#81c784',
      background: '#12241b',
      panel: '#183026',
      input: '#152b21',
      text: '#e7f0ea',
      border: '#2b4637',
      userBubble: '#2c5a40',
      assistantBubble: '#1c3b2c',
    },
  },
  {
    id: 'rose',
    colors: {
      accent: '#f48fb1',
      background: '#291a21',
      panel: '#36232d',
      input: '#2e1f27',
      text: '#f7e9ee',
      border: '#4a3340',
      userBubble: '#743951',
      assistantBubble: '#46293a',
    },
  },
  {
    id: 'monochrome',
    colors: {
      accent: '#b4b4b9',
      background: '#17171a',
      panel: '#202025',
      input: '#1c1c20',
      text: '#eeeef0',
      border: '#333338',
      userBubble: '#3a3a40',
      assistantBubble: '#27272c',
    },
  },
]
