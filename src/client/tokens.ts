/**
 * Role → `--dsw-alias-*` token override computation and the shipped presets.
 * The theme service requires `{ light, dark }` pairs per token, so every
 * derived value is computed twice, once against the light mode base and once
 * against the dark mode base; role colors themselves repeat in both modes
 * (one user color serves both palettes).
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceRole, AppearanceSettings } from '../appearance-settings.ts'
import { isDarkColor, mixHex, withAlpha } from './color.ts'
// Schema bounds live next to the settings document; re-exported here so the
// slider caps and the persistence sanitizer share one source of truth.
export { BACKGROUND_BLUR_MAX, EMPHASIS_ALPHA_MAX, EMPHASIS_ALPHA_MIN, GLASS_BLUR_MAX } from '../appearance-settings.ts'

/** Override-layer source name pinned to this package (also names inspection). */
export const OVERRIDE_SOURCE = '@deepseek-ai/dsh-client-ui-appearance'

/** Mode base a derived step mixes toward: light mixes toward white. */
const LIGHT_BASE = '#ffffff'
/** Mode base a derived step mixes toward: dark mixes toward near-black. */
const DARK_BASE = '#151517'

/**
 * Stock surface colors per mode (design-platform.css alias tokens, resolved
 * to their static steps). The translucent pass bakes these into rgba() when
 * no role color or dark-flip value applies; keep in sync with the theme
 * package's design-platform.css.
 */
const DEFAULT_SURFACE_COLORS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-bg-base': { light: '#ffffff', dark: '#151517' }, // bluish-00 / bluish-950
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#232324' }, // bluish-00 / bluish-875
  '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#2c2c2e' }, // bluish-00 / bluish-850
  '--dsw-alias-bg-layer-3': { light: '#ffffff', dark: '#353638' }, // bluish-00 / bluish-800
  '--dsw-alias-bg-overlay': { light: '#e9ecf2', dark: '#61666b' }, // bluish-150 / bluish-700
  '--dsw-alias-bg-module-platform': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  '--dsw-alias-bg-multi-select': { light: '#f5f6f7', dark: '#2c2c2e' }, // bluish-60 / bluish-850
  '--dsw-specific-sidebar-fill': { light: '#f9fafb', dark: '#1b1b1c' }, // bluish-50 / bluish-900
  '--dsw-specific-input-major': { light: '#ffffff', dark: '#2c2c2e' }, // bluish-00 / bluish-850
  '--dsw-specific-bubble-highlight': { light: '#d3e2ff', dark: '#43454a' }, // deepseek-200 / bluish-750
  '--dsw-specific-bubble': { light: '#edf3fe', dark: '#2c2c2e' }, // deepseek-50 / bluish-850
  // Settings nav selected state and floating menus are surfaces too.
  '--dsw-specific-sidebar-nav-item-active': { light: '#ebeef2', dark: '#43454a' }, // bluish-100 / bluish-750
  '--dsw-specific-sidebar-nav-item-hover': { light: '#f1f3f5', dark: '#2c2c2e' }, // bluish-75 / bluish-850
  '--dsw-specific-menu': { light: '#ffffff', dark: '#353638' }, // layer-3 / layer-3
  // Composer + button (the round command trigger) and the jobs action's
  // hover fill; fill-l2 is referenced by ui-jobs but undefined in the theme
  // package — defining it here gives the job button its intended hover fill.
  '--dsw-specific-selector': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  '--dsw-alias-fill-l2': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  // Solid interactive hover (the composer + button hover, chips, etc.) rides
  // the translucency too so hovers never snap back to an opaque chip.
  '--dsw-alias-interactive-bg-hover-solid': { light: '#f1f3f5', dark: '#353638' }, // bluish-75 / bluish-800
  // Task surfaces in the conversation area (todo panel, queue dock, goal
  // bar) ride the translucency with the other panels.
  '--dsw-specific-tip': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  // Inline code (`pnpm-lock.yaml`, `lib/`) and code blocks are emphasized
  // text surfaces too — they must not stay solid white chips in a
  // translucent interface.
  '--dsw-alias-markdown-inline-code': { light: '#ebeef2', dark: '#2c2c2e' }, // bluish-100 / bluish-850
  '--dsw-alias-markdown-code-block': { light: '#f9fafb', dark: '#1b1b1c' }, // bluish-50 / bluish-900
  '--dsw-alias-markdown-code-block-banner': { light: '#f9fafb', dark: '#2c2c2e' }, // bluish-50 / bluish-850
  // Neutral buttons follow the surface translucency too; brand/accent action
  // buttons ride it as well — translucent brand color keeps the emphasis via
  // hue without a solid white block on a translucent interface.
  '--dsw-alias-button-elevated-fill': { light: '#ffffff', dark: '#43454a' }, // bluish-00 / bluish-750
  '--dsw-alias-button-floating-fill': { light: '#ffffff', dark: '#2c2c2e' }, // bluish-00 / bluish-850
  '--dsw-alias-button-floating-hover': { light: '#f1f3f5', dark: '#353638' }, // bluish-75 / bluish-800
  '--dsw-alias-button-primary-fill': { light: '#0f1115', dark: '#f9fafb' }, // bluish-1000 / bluish-50
  '--dsw-alias-button-info-fill': { light: '#4176e6', dark: '#679efe' }, // deepseek-500 / deepseek-400
}

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

  const { accent, background, panel, input, text, border, backgroundImage, imageDark, surfaceAlpha, inputAlpha, codeAlpha, sidebarOpaque, emphasisAlpha } = settings

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
    // Message bubbles (the harness renders its only bubble background on
    // user messages; assistant turns have none) follow the accent color.
    // Both bubble tokens get the hue; the translucent pass adds the alpha.
    emit('--dsw-specific-bubble', light, dark)
    emit('--dsw-specific-bubble-highlight', light, dark)
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

  // Background image makes the base canvas transparent so the wallpaper
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
  // The flip's derived surface colors feed the translucent pass below, so a
  // translucent dark theme stays coordinated.
  let flipLayer1: string | undefined
  let flipLayer2: string | undefined
  let flipSidebar: string | undefined
  let flipButtonElevated: string | undefined
  let flipButtonFloating: string | undefined
  let flipButtonFloatingHover: string | undefined
  if (flipBase !== undefined) {
    flipLayer1 = mixHex(flipBase, LIGHT_BASE, 0.06)
    flipLayer2 = mixHex(flipBase, LIGHT_BASE, 0.12)
    flipSidebar = mixHex(flipBase, LIGHT_BASE, 0.03)
    flipButtonElevated = 'rgb(67, 69, 74)'
    flipButtonFloating = 'rgb(44, 44, 46)'
    flipButtonFloatingHover = 'rgb(53, 54, 56)'
    emit('--dsw-alias-bg-layer-1', flipLayer1, flipLayer1)
    emit('--dsw-alias-bg-layer-2', flipLayer2, flipLayer2)
    emit('--dsw-specific-sidebar-fill', flipSidebar, flipSidebar)
    if (text === '') {
      emit('--dsw-alias-label-primary', '#fafaf9', '#fafaf9')
      emit('--dsw-alias-label-secondary', '#d6d3d1', '#d6d3d1')
    }
    emit('--dsw-alias-button-elevated-fill', flipButtonElevated, flipButtonElevated)
    emit('--dsw-alias-button-floating-fill', flipButtonFloating, flipButtonFloating)
    emit('--dsw-alias-button-floating-hover', flipButtonFloatingHover, flipButtonFloatingHover)
  }

  if (surfaceAlpha < 1) {
    const alpha = surfaceAlpha
    // Surface translucency bakes a plain rgba() per mode — NEVER a
    // color-mix referencing the token itself: `color-mix(in srgb,
    // var(--x) n%, transparent)` assigned to --x is a custom-property
    // cycle, the property goes guaranteed-invalid, and every surface using
    // it turns fully transparent (only 0%/100% looked "working").
    // Resolution order: explicit role color → dark-flip derived value →
    // the stock palette for that mode (design-platform.css, kept in sync
    // manually).
    const translucent = (token: string, explicit: string | undefined, flip: string | undefined, alphaOverride?: number): void => {
      if (explicit === 'transparent') {
        emit(token, 'transparent', 'transparent')
        return
      }
      const base = explicit !== undefined && explicit !== ''
        ? { light: explicit, dark: explicit }
        : flip !== undefined
          ? { light: flip, dark: flip }
          : DEFAULT_SURFACE_COLORS[token] ?? { light: LIGHT_BASE, dark: DARK_BASE }
      const a = alphaOverride ?? alpha
      emit(token, withAlpha(base.light, a), withAlpha(base.dark, a))
    }
    // An image keeps the base transparent even under surface translucency.
    translucent('--dsw-alias-bg-base', backgroundImage !== '' ? 'transparent' : background, undefined)
    translucent('--dsw-alias-bg-layer-1', panel, flipLayer1)
    // Layer-2 backs the settings panel root, so it must follow the panel
    // color too (its 8% light-derived step keeps the layer depth).
    translucent('--dsw-alias-bg-layer-2', panel !== '' ? mixHex(panel, LIGHT_BASE, 0.08) : undefined, flipLayer2)
    translucent('--dsw-alias-bg-layer-3', undefined, undefined)
    translucent('--dsw-alias-bg-overlay', undefined, undefined)
    translucent('--dsw-alias-bg-module-platform', undefined, undefined)
    translucent('--dsw-alias-bg-multi-select', undefined, undefined)
    // The sidebar can opt out of the surface translucency: navigation stays
    // solid even when everything else melts into the wallpaper.
    if (!sidebarOpaque) translucent('--dsw-specific-sidebar-fill', panel ?? background, flipSidebar)
    translucent('--dsw-specific-input-major', input, undefined, inputAlpha < 1 ? inputAlpha : alpha)
    // Bubbles follow the accent hue at the surface alpha (set above).
    translucent('--dsw-specific-bubble', accent, undefined)
    translucent('--dsw-specific-bubble-highlight', accent, undefined)
    translucent('--dsw-specific-sidebar-nav-item-active', undefined, undefined)
    translucent('--dsw-specific-sidebar-nav-item-hover', undefined, undefined)
    translucent('--dsw-specific-menu', undefined, undefined)
    translucent('--dsw-specific-selector', undefined, undefined)
    translucent('--dsw-alias-fill-l2', undefined, undefined)
    translucent('--dsw-alias-interactive-bg-hover-solid', undefined, undefined)
    translucent('--dsw-specific-tip', undefined, undefined)
    // Inline code keeps its emphasis via hue: a low-alpha brand tint (the
    // user accent, else the stock brand) instead of a translucent gray —
    // path/file chips stay recognizable without a solid white block. The
    // tint alpha is user-controlled (emphasisAlpha, default 0.22 to match
    // the harness's own reference-chip alpha).
    const inlineCodeBase = accent !== '' && accent !== undefined ? accent : '#4176e6'
    const inlineCodeBaseDark = accent !== '' && accent !== undefined ? accent : '#679efe'
    emit('--dsw-alias-markdown-inline-code', withAlpha(inlineCodeBase, emphasisAlpha), withAlpha(inlineCodeBaseDark, emphasisAlpha))
    translucent('--dsw-alias-markdown-code-block', undefined, undefined, codeAlpha < 1 ? codeAlpha : alpha)
    translucent('--dsw-alias-markdown-code-block-banner', undefined, undefined, codeAlpha < 1 ? codeAlpha : alpha)
    // Neutral buttons ride the same translucency so they do not stand out as
    // solid chips on a translucent interface.
    translucent('--dsw-alias-button-elevated-fill', undefined, flipButtonElevated)
    translucent('--dsw-alias-button-floating-fill', undefined, flipButtonFloating)
    translucent('--dsw-alias-button-floating-hover', undefined, flipButtonFloatingHover)
    // Brand/accent action buttons (send, primary) follow too: a translucent
    // brand color keeps the hue-based emphasis without a solid block.
    translucent('--dsw-alias-button-primary-fill', accent, undefined)
    translucent('--dsw-alias-button-info-fill', accent, undefined)
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
    },
  },
]
