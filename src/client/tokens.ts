/**
 * Role → `--dsw-alias-*` token override computation and the shipped presets.
 * The theme service requires `{ light, dark }` pairs per token, so every
 * derived value is computed twice, once against the light mode base and once
 * against the dark mode base; role colors themselves repeat in both modes
 * (one user color serves both palettes).
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceRole, AppearanceSettings } from '../appearance-settings.ts'
import { contrastRatio, isDarkColor, mixHex, relativeLuminance, withAlpha } from './color.ts'
// Schema bounds live next to the settings document; re-exported here so the
// slider caps and the persistence sanitizer share one source of truth.
export { BACKGROUND_BLUR_MAX, EMPHASIS_ALPHA_MAX, EMPHASIS_ALPHA_MIN, GLASS_BLUR_MAX } from '../appearance-settings.ts'

/** Override-layer source name pinned to this package (also names inspection). */
export const OVERRIDE_SOURCE = '@deepseek-ai/dsh-client-ui-appearance'

/** Mode base a derived step mixes toward: light mixes toward white. */
const LIGHT_BASE = '#ffffff'
/** Mode base a derived step mixes toward: dark mixes toward near-black. */
const DARK_BASE = '#151517'
/** Ink painted ON a light label fill (badge letters, selection text). */
const LIGHT_INK = '#fafaf9'
/** Ink painted ON a dark label fill (host stock light-mode label). */
const DARK_INK = '#0f1115'

/**
 * The on-ink counterpart of a label color. The sidebar wordmark's "harness"
 * badge paints its chip with `currentColor` (the label color) and its letters
 * with `--dsw-alias-label-primary-inverted`; `::selection` pairs its
 * background with `-foreground` the same way. Overriding the label color
 * without re-deriving these two breaks both pairings — a white chip keeps
 * the stock light-mode white letters and the badge disappears.
 */
const onInk = (label: string): string => {
  // WCAG contrast between the label and each candidate ink. Human visual
  // perception has a strong positive polarity bias on colored backgrounds
  // (saturated hues like DeepSeek brand blue #4176e6 and purple #7c3aed
  // have low sRGB blue coefficients, making white text significantly more legible
  // than dark text even when mathematical contrast ratios are close).
  // A modest offset of 0.5 favors light ink on rich colored surfaces while
  // preserving dark ink for light backgrounds (#749aec, #ffffff) and neutral
  // mid-tones (#808080).
  return contrastRatio(label, LIGHT_INK) >= contrastRatio(label, DARK_INK) - 0.5 ? LIGHT_INK : DARK_INK
}

/**
 * Pick the largest mix weight toward `base` that satisfies the target WCAG contrast
 * ratio against `surf` using binary search in `[0, stockWeight]`.
 * Falls back to `text` itself if `text` on `surf` already fails the target.
 */
function a11yLabelStep(
  text: string,
  base: string,
  surf: string,
  targetRatio: number,
  stockWeight: number,
): string {
  if (text === '' || surf === '') return ''
  if (contrastRatio(text, surf) < targetRatio) return text
  if (contrastRatio(mixHex(text, base, stockWeight), surf) >= targetRatio) {
    return mixHex(text, base, stockWeight)
  }
  let lo = 0
  let hi = stockWeight
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (contrastRatio(mixHex(text, base, mid), surf) >= targetRatio) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return mixHex(text, base, lo)
}

/**
 * Derive a readable label or icon step from a base label on a surface.
 * Automatically chooses the mix base (white for dark text, near-black for light text)
 * and the appropriate stock weight (light vs dark mode stock).
 */
function deriveStepForLabel(
  label: string,
  surf: string,
  targetRatio: number,
  lightStock: number,
  darkStock: number,
): string {
  const isDark = isDarkColor(label)
  const base = isDark ? LIGHT_BASE : DARK_BASE
  const stock = isDark ? lightStock : darkStock
  return a11yLabelStep(label, base, surf, targetRatio, stock)
}

/**
 * Per-mode ink color for the user-message bubble when accent auto-inversion
 * is enabled; `null` for a mode where it is off (the bubble keeps the normal
 * text color).
 *
 * The bubble stylesheet is `color: var(--dsw-alias-label-primary)` and there
 * is no bubble-specific foreground token, so this cannot be fixed through the
 * theme override layer alone (that variable is global). The applier instead
 * scopes `--dsw-alias-label-primary` on the bubble subtree with this value;
 * CSS custom properties inherit through the bubble DOM, so markdown and
 * other descendants referencing the token pick up the contrasting ink too.
 * @param settings - current appearance settings.
 * @returns per-mode ink hex, or null when inversion is off for that mode.
 */
export function bubbleInk(settings: AppearanceSettings): { light: string | null; dark: string | null } {
  const inkFor = (mode: 'light' | 'dark'): string | null => {
    if (!settings[mode]?.invert?.accent) return null
    const surf = settings[mode]?.panel || (mode === 'light' ? settings.panel : '')
      || settings[mode]?.background || (mode === 'light' ? settings.background : '')
      || DEFAULT_SURFACE_COLORS['--dsw-specific-bubble'][mode]
    return onInk(surf)
  }
  return {
    light: inkFor('light'),
    dark: inkFor('dark'),
  }
}

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
  '--dsw-menu-surface-fill': { light: '#ffffff', dark: '#353638' }, // used by MenuSurface popovers
  '--dsw-alias-fill-l1': { light: '#f5f6f7', dark: '#353638' }, // used by ui-jobs
  // Composer + button (the round command trigger) and the jobs action's
  // hover fill; fill-l2 is referenced by ui-jobs but undefined in the theme
  // package — defining it here gives the job button its intended hover fill.
  '--dsw-specific-selector': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  '--dsw-alias-fill-l2': { light: '#f5f6f7', dark: '#353638' }, // bluish-60 / bluish-800
  // Solid interactive hover (the composer + button hover, chips, etc.) rides
  // the translucency too so hovers never snap back to an opaque chip.
  '--dsw-alias-interactive-bg-hover': { light: '#f1f3f5', dark: '#353638' }, // bluish-75 / bluish-800
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
  '--dsw-alias-button-primary-fill': { light: '#4176e6', dark: '#679efe' }, // deepseek-500 / deepseek-400
  '--dsw-alias-button-info-fill': { light: '#4176e6', dark: '#679efe' }, // send + stop ride the accent hue
  // Hover states of those buttons (stock design-platform.css values). The
  // translucent pass bakes them with the input alpha so hovering never
  // snaps a translucent button back to solid.
  '--dsw-alias-button-info-hover': { light: '#679efe', dark: '#4176e6' }, // deepseek-400 / deepseek-500
  '--dsw-alias-button-primary-hover': { light: '#43454a', dark: '#ebeef2' }, // bluish-750 / bluish-100
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

  const {
    backgroundImage, backgroundVideo, imageDark, surfaceAlpha, inputAlpha, codeAlpha,
    sidebarOpaque, emphasisAlpha,
  } = settings

  // The wallpaper and the background video share one layer (#dsw-appearance-bg,
  // `position: fixed; z-index: -1`), so both need the frame's own background
  // token punched out to transparent, or that layer stays hidden under it.
  const hasBackgroundMedia = backgroundImage !== '' || backgroundVideo !== ''

  const getRole = (role: AppearanceRole): { light: string; dark: string } => {
    const l = settings.light?.[role] || ''
    const d = settings.dark?.[role] || ''
    // If either mode explicitly customized this role, the modes are strictly decoupled:
    // leaving a role empty in one mode means "keep the stock token for that mode",
    // never leak the other mode's color via the legacy mirror field.
    const hasPerModeConfig = l !== '' || d !== ''
    const legacy = !hasPerModeConfig ? (settings[role] || '') : ''
    return {
      light: l !== '' ? l : legacy,
      dark: d !== '' ? d : legacy,
    }
  }

  const accentRole = getRole('accent')
  const hasAccentL = accentRole.light !== ''
  const hasAccentD = accentRole.dark !== ''
  const lightAccent = hasAccentL ? accentRole.light : '#4176e6'
  const darkAccent = hasAccentD ? accentRole.dark : '#4176e6'

  // Accent tokens: emit brand and state tokens
  emit('--dsw-alias-brand-primary', lightAccent, darkAccent)
  emit('--dsw-alias-state-business-primary', lightAccent, darkAccent)
  emit('--dsw-alias-button-info-fill', lightAccent, darkAccent)

  const lightInfoHover = hasAccentL ? mixHex(lightAccent, LIGHT_BASE, 0.15) : undefined
  const darkInfoHover = hasAccentD ? mixHex(darkAccent, DARK_BASE, 0.15) : undefined
  if (lightInfoHover !== undefined || darkInfoHover !== undefined) {
    emit(
      '--dsw-alias-button-info-hover',
      lightInfoHover ?? DEFAULT_SURFACE_COLORS['--dsw-alias-button-info-hover'].light,
      darkInfoHover ?? DEFAULT_SURFACE_COLORS['--dsw-alias-button-info-hover'].dark,
    )
  }

  const lightPrimaryHover = hasAccentL ? mixHex(lightAccent, LIGHT_BASE, 0.22) : undefined
  const darkPrimaryHover = hasAccentD ? mixHex(darkAccent, DARK_BASE, 0.22) : undefined
  if (lightPrimaryHover !== undefined || darkPrimaryHover !== undefined) {
    emit(
      '--dsw-alias-button-primary-hover',
      lightPrimaryHover ?? DEFAULT_SURFACE_COLORS['--dsw-alias-button-primary-hover'].light,
      darkPrimaryHover ?? DEFAULT_SURFACE_COLORS['--dsw-alias-button-primary-hover'].dark,
    )
  }

  const bg = getRole('background')
  const panel = getRole('panel')

  if (bg.light !== '' || bg.dark !== '') {
    const lightBase = bg.light !== '' ? bg.light : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-base'].light
    const darkBase = bg.dark !== '' ? bg.dark : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-base'].dark
    emit('--dsw-alias-bg-base', lightBase, darkBase)
  }

  if (panel.light !== '' || panel.dark !== '') {
    const l1l = panel.light !== '' ? panel.light : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-1'].light
    const l1d = panel.dark !== '' ? panel.dark : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-1'].dark
    emit('--dsw-alias-bg-layer-1', l1l, l1d)

    const l2l = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.08) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-2'].light
    const l2d = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.08) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-2'].dark
    emit('--dsw-alias-bg-layer-2', l2l, l2d)

    const l3l = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.14) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-3'].light
    const l3d = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.14) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-3'].dark
    emit('--dsw-alias-bg-layer-3', l3l, l3d)

    const ovl = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.1) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-overlay'].light
    const ovd = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.1) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-overlay'].dark
    emit('--dsw-alias-bg-overlay', ovl, ovd)

    const modl = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.06) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-module-platform'].light
    const modd = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.06) : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-module-platform'].dark
    emit('--dsw-alias-bg-module-platform', modl, modd)

    const sideL = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.04) : DEFAULT_SURFACE_COLORS['--dsw-specific-sidebar-fill'].light
    const sideD = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.04) : DEFAULT_SURFACE_COLORS['--dsw-specific-sidebar-fill'].dark
    emit('--dsw-specific-sidebar-fill', sideL, sideD)

    const bubL = panel.light !== '' ? panel.light : DEFAULT_SURFACE_COLORS['--dsw-specific-bubble'].light
    const bubD = panel.dark !== '' ? panel.dark : DEFAULT_SURFACE_COLORS['--dsw-specific-bubble'].dark
    emit('--dsw-specific-bubble', bubL, bubD)

    const bubHlL = panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.12) : DEFAULT_SURFACE_COLORS['--dsw-specific-bubble-highlight'].light
    const bubHlD = panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.12) : DEFAULT_SURFACE_COLORS['--dsw-specific-bubble-highlight'].dark
    emit('--dsw-specific-bubble-highlight', bubHlL, bubHlD)
  }

  const input = getRole('input')
  if (input.light !== '' || input.dark !== '') {
    const inputL = input.light !== '' ? input.light : DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].light
    const inputD = input.dark !== '' ? input.dark : DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].dark
    emit('--dsw-specific-input-major', inputL, inputD)

    const loginL = input.light !== '' ? mixHex(input.light, LIGHT_BASE, 0.06) : DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].light
    const loginD = input.dark !== '' ? mixHex(input.dark, DARK_BASE, 0.06) : DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].dark
    emit('--dsw-specific-login-input', loginL, loginD)
  }

  const text = getRole('text')
  const textSet = text.light !== '' || text.dark !== ''
  const textL = text.light !== '' ? text.light : '#0f1115'
  const textD = text.dark !== '' ? text.dark : '#fafaf9'
  const surfL = panel.light !== '' ? panel.light : '#ffffff'
  const surfD = panel.dark !== '' ? panel.dark : '#151517'

  // Per-mode invert flags. `invert.accent` makes the foreground text painted
  // on accent surfaces (bubble, selection, accent buttons) auto-contrast with
  // the accent color instead of the text role.
  const invL = settings.light?.invert ?? {}
  const invD = settings.dark?.invert ?? {}
  const accentInkL = invL.accent ? onInk(lightAccent) : onInk(textL)
  const accentInkD = invD.accent ? onInk(darkAccent) : onInk(textD)

  if (textSet || invL.accent || invD.accent) {
    if (textSet) {
      emit('--dsw-alias-label-primary', textL, textD)

      const secL = text.light !== '' ? a11yLabelStep(text.light, LIGHT_BASE, surfL, 7, 0.38) : '#61666b'
      const secD = text.dark !== '' ? a11yLabelStep(text.dark, DARK_BASE, surfD, 7, 0.16) : '#d6d3d1'
      emit('--dsw-alias-label-secondary', secL, secD)

      const terL = text.light !== '' ? a11yLabelStep(text.light, LIGHT_BASE, surfL, 4.5, 0.58) : '#9ea3a8'
      const terD = text.dark !== '' ? a11yLabelStep(text.dark, DARK_BASE, surfD, 4.5, 0.53) : '#808285'
      emit('--dsw-alias-label-tertiary', terL, terD)

      const capL = text.light !== '' ? a11yLabelStep(text.light, LIGHT_BASE, surfL, 4.5, 0.58) : '#9ea3a8'
      const capD = text.dark !== '' ? a11yLabelStep(text.dark, DARK_BASE, surfD, 4.5, 0.53) : '#808285'
      emit('--dsw-alias-label-caption', capL, capD)

      const menuL = text.light !== '' ? a11yLabelStep(text.light, LIGHT_BASE, surfL, 7, 0.18) : a11yLabelStep('#0f1115', LIGHT_BASE, surfL, 7, 0.18)
      const menuD = text.dark !== '' ? a11yLabelStep(text.dark, DARK_BASE, surfD, 7, 0.18) : a11yLabelStep('#fafaf9', DARK_BASE, surfD, 7, 0.18)
      emit('--dsw-alias-menu-icon', menuL, menuD)
    }
    // The on-accent ink pair is emitted whenever the text role is customized
    // OR accent inversion is on, so the bubble/selection/accent-button text
    // always pairs with its actual background.
    emit('--dsw-alias-label-primary-inverted', accentInkL, accentInkD)
    emit('--dsw-alias-label-primary-foreground', accentInkL, accentInkD)
  }

  // Background auto-inversion: turning on inversion for the background role
  // makes the global text color contrast with that surface. This is an
  // explicit user override — it wins over the text role (a dark background
  // with stock light text would be unreadable), so there is no `!textSet`
  // gate. Per-mode independent so a dark-mode invert doesn't leak into light.
  // Only background is invertible here: panel/input are sub-surfaces and a
  // single label token cannot express per-sub-surface ink.
  const inkL = invL.background && bg.light !== '' ? onInk(bg.light) : ''
  const inkD = invD.background && bg.dark !== '' ? onInk(bg.dark) : ''
  if (inkL !== '' || inkD !== '') {
    const prevPrimary = tokens['--dsw-alias-label-primary']
    const prevInk = tokens['--dsw-alias-label-primary-inverted']
    const labelL = inkL !== '' ? inkL : (prevPrimary?.light ?? '#0f1115')
    const labelD = inkD !== '' ? inkD : (prevPrimary?.dark ?? '#fafaf9')
    emit('--dsw-alias-label-primary', labelL, labelD)
    // Re-derive the on-ink pair together with the new label, so the sidebar
    // "harness" badge letters (painted with -inverted) and ::selection text
    // pair with the new label fill instead of keeping the previous on-ink
    // color and fading into the flipped chip. Modes left stock keep their
    // previous on-ink value.
    const invInkL = inkL !== '' ? onInk(labelL) : (prevInk?.light ?? LIGHT_INK)
    const invInkD = inkD !== '' ? onInk(labelD) : (prevInk?.dark ?? DARK_INK)
    emit('--dsw-alias-label-primary-inverted', invInkL, invInkD)
    emit('--dsw-alias-label-primary-foreground', invInkL, invInkD)

    // Re-derive secondary, tertiary, caption and menu-icon tokens so sub-labels remain legible
    // and meet WCAG contrast when background inversion flips label-primary.
    const invSurfL = inkL !== '' ? bg.light : surfL
    const invSurfD = inkD !== '' ? bg.dark : surfD

    emit(
      '--dsw-alias-label-secondary',
      inkL !== '' ? deriveStepForLabel(labelL, invSurfL, 7, 0.38, 0.16) : (tokens['--dsw-alias-label-secondary']?.light ?? deriveStepForLabel(labelL, invSurfL, 7, 0.38, 0.16)),
      inkD !== '' ? deriveStepForLabel(labelD, invSurfD, 7, 0.38, 0.16) : (tokens['--dsw-alias-label-secondary']?.dark ?? deriveStepForLabel(labelD, invSurfD, 7, 0.38, 0.16)),
    )
    emit(
      '--dsw-alias-label-tertiary',
      inkL !== '' ? deriveStepForLabel(labelL, invSurfL, 4.5, 0.58, 0.53) : (tokens['--dsw-alias-label-tertiary']?.light ?? deriveStepForLabel(labelL, invSurfL, 4.5, 0.58, 0.53)),
      inkD !== '' ? deriveStepForLabel(labelD, invSurfD, 4.5, 0.58, 0.53) : (tokens['--dsw-alias-label-tertiary']?.dark ?? deriveStepForLabel(labelD, invSurfD, 4.5, 0.58, 0.53)),
    )
    emit(
      '--dsw-alias-label-caption',
      inkL !== '' ? deriveStepForLabel(labelL, invSurfL, 4.5, 0.58, 0.53) : (tokens['--dsw-alias-label-caption']?.light ?? deriveStepForLabel(labelL, invSurfL, 4.5, 0.58, 0.53)),
      inkD !== '' ? deriveStepForLabel(labelD, invSurfD, 4.5, 0.58, 0.53) : (tokens['--dsw-alias-label-caption']?.dark ?? deriveStepForLabel(labelD, invSurfD, 4.5, 0.58, 0.53)),
    )
    emit(
      '--dsw-alias-menu-icon',
      inkL !== '' ? deriveStepForLabel(labelL, invSurfL, 7, 0.18, 0.18) : (tokens['--dsw-alias-menu-icon']?.light ?? deriveStepForLabel(labelL, invSurfL, 7, 0.18, 0.18)),
      inkD !== '' ? deriveStepForLabel(labelD, invSurfD, 7, 0.18, 0.18) : (tokens['--dsw-alias-menu-icon']?.dark ?? deriveStepForLabel(labelD, invSurfD, 7, 0.18, 0.18)),
    )
  }

  const border = getRole('border')
  if (border.light !== '' || border.dark !== '') {
    const borderL = border.light !== '' ? border.light : '#d9dde3'
    const borderD = border.dark !== '' ? border.dark : '#333338'
    emit('--dsw-alias-border-l1', borderL, borderD)
    emit('--dsw-alias-border-l2', borderL, borderD)

    const l3l = border.light !== '' ? mixHex(border.light, LIGHT_BASE, 0.3) : '#ebeef2'
    const l3d = border.dark !== '' ? mixHex(border.dark, DARK_BASE, 0.3) : '#43454a'
    emit('--dsw-alias-border-l3', l3l, l3d)
  }

  const controlBaseLight = panel.light
  const controlBaseDark = panel.dark
  let controlButtonFill: [string, string] | undefined
  let controlButtonHover: [string, string] | undefined
  let controlNavActive: [string, string] | undefined
  let controlNavHover: [string, string] | undefined
  if (controlBaseLight !== '' || controlBaseDark !== '') {
    const baseL = controlBaseLight !== '' ? controlBaseLight : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-1'].light
    const baseD = controlBaseDark !== '' ? controlBaseDark : DEFAULT_SURFACE_COLORS['--dsw-alias-bg-layer-1'].dark

    controlButtonFill = [mixHex(baseL, LIGHT_BASE, 0.06), mixHex(baseD, LIGHT_BASE, 0.06)]
    controlButtonHover = [mixHex(baseL, LIGHT_BASE, 0.12), mixHex(baseD, LIGHT_BASE, 0.12)]
    controlNavActive = [mixHex(baseL, DARK_BASE, 0.10), mixHex(baseD, LIGHT_BASE, 0.10)]
    controlNavHover = [mixHex(baseL, DARK_BASE, 0.05), mixHex(baseD, LIGHT_BASE, 0.05)]

    emit('--dsw-alias-button-elevated-fill', controlButtonFill[0], controlButtonFill[1])
    emit('--dsw-alias-button-floating-fill', controlButtonFill[0], controlButtonFill[1])
    emit('--dsw-alias-button-floating-hover', controlButtonHover[0], controlButtonHover[1])
    emit('--dsw-specific-sidebar-nav-item-active', controlNavActive[0], controlNavActive[1])
    emit('--dsw-specific-sidebar-nav-item-hover', controlNavHover[0], controlNavHover[1])
    emit('--dsw-specific-selector', controlButtonFill[0], controlButtonFill[1])
    emit('--dsw-alias-interactive-bg-hover', controlButtonHover[0], controlButtonHover[1])
    emit('--dsw-alias-interactive-bg-hover-solid', controlButtonHover[0], controlButtonHover[1])
  }

  if (hasBackgroundMedia) {
    emit('--dsw-alias-bg-base', 'transparent', 'transparent')
  }

  const flipBaseLight = hasBackgroundMedia ? (imageDark ? '#151517' : undefined) : undefined
  const flipBaseDark = hasBackgroundMedia ? (imageDark ? '#151517' : undefined) : undefined

  let flipLayer1: [string | undefined, string | undefined] = [undefined, undefined]
  let flipLayer2: [string | undefined, string | undefined] = [undefined, undefined]
  let flipLayer3: [string | undefined, string | undefined] = [undefined, undefined]
  let flipSidebar: [string | undefined, string | undefined] = [undefined, undefined]
  let flipInput: [string | undefined, string | undefined] = [undefined, undefined]
  let flipMod: [string | undefined, string | undefined] = [undefined, undefined]
  let flipOverlay: [string | undefined, string | undefined] = [undefined, undefined]
  let flipButtonElevated: [string | undefined, string | undefined] = [undefined, undefined]
  let flipButtonFloating: [string | undefined, string | undefined] = [undefined, undefined]
  let flipButtonFloatingHover: [string | undefined, string | undefined] = [undefined, undefined]

  if (flipBaseLight !== undefined || flipBaseDark !== undefined) {
    const calcFlip = (base: string | undefined): {
      l1: string
      l2: string
      l3: string
      side: string
      input: string
      mod: string
      overlay: string
      btnElev: string
      btnFloat: string
      btnHover: string
    } | undefined => {
      if (base === undefined) return undefined
      return {
        l1: mixHex(base, LIGHT_BASE, 0.06),
        l2: mixHex(base, LIGHT_BASE, 0.12),
        l3: mixHex(base, LIGHT_BASE, 0.18),
        side: mixHex(base, LIGHT_BASE, 0.03),
        input: mixHex(base, LIGHT_BASE, 0.12),
        mod: mixHex(base, LIGHT_BASE, 0.18),
        overlay: mixHex(base, LIGHT_BASE, 0.35),
        btnElev: 'rgb(67, 69, 74)',
        btnFloat: 'rgb(44, 44, 46)',
        btnHover: 'rgb(53, 54, 56)',
      }
    }
    const fl = calcFlip(flipBaseLight)
    const fd = calcFlip(flipBaseDark)
    flipLayer1 = [fl?.l1, fd?.l1]
    flipLayer2 = [fl?.l2, fd?.l2]
    flipLayer3 = [fl?.l3, fd?.l3]
    flipSidebar = [fl?.side, fd?.side]
    flipInput = [fl?.input, fd?.input]
    flipMod = [fl?.mod, fd?.mod]
    flipOverlay = [fl?.overlay, fd?.overlay]
    flipButtonElevated = [fl?.btnElev, fd?.btnElev]
    flipButtonFloating = [fl?.btnFloat, fd?.btnFloat]
    flipButtonFloatingHover = [fl?.btnHover, fd?.btnHover]

    if (fl !== undefined || fd !== undefined) {
      const getVal = (v: [string | undefined, string | undefined], fallbackToken: string): [string, string] => [
        tokens[fallbackToken]?.light ?? v[0] ?? DEFAULT_SURFACE_COLORS[fallbackToken].light,
        tokens[fallbackToken]?.dark ?? v[1] ?? DEFAULT_SURFACE_COLORS[fallbackToken].dark,
      ]
      const l1 = getVal(flipLayer1, '--dsw-alias-bg-layer-1')
      emit('--dsw-alias-bg-layer-1', l1[0], l1[1])
      const l2 = getVal(flipLayer2, '--dsw-alias-bg-layer-2')
      emit('--dsw-alias-bg-layer-2', l2[0], l2[1])
      const l3 = getVal(flipLayer3, '--dsw-alias-bg-layer-3')
      emit('--dsw-alias-bg-layer-3', l3[0], l3[1])
      const side = getVal(flipSidebar, '--dsw-specific-sidebar-fill')
      emit('--dsw-specific-sidebar-fill', side[0], side[1])
      const mod = getVal(flipMod, '--dsw-alias-bg-module-platform')
      emit('--dsw-alias-bg-module-platform', mod[0], mod[1])
      const multi = getVal(flipLayer2, '--dsw-alias-bg-multi-select')
      emit('--dsw-alias-bg-multi-select', multi[0], multi[1])
      const ov = getVal(flipOverlay, '--dsw-alias-bg-overlay')
      emit('--dsw-alias-bg-overlay', ov[0], ov[1])
      const menu = getVal(flipLayer3, '--dsw-specific-menu')
      emit('--dsw-specific-menu', menu[0], menu[1])
      emit('--dsw-menu-surface-fill', menu[0], menu[1])
      const fillL1 = getVal(flipMod, '--dsw-alias-fill-l1')
      emit('--dsw-alias-fill-l1', fillL1[0], fillL1[1])
      const fillL2 = getVal(flipMod, '--dsw-alias-fill-l2')
      emit('--dsw-alias-fill-l2', fillL2[0], fillL2[1])
      const tip = getVal(flipMod, '--dsw-specific-tip')
      emit('--dsw-specific-tip', tip[0], tip[1])
      const bub = getVal(flipLayer2, '--dsw-specific-bubble')
      emit('--dsw-specific-bubble', bub[0], bub[1])
      const bubHl = getVal(flipLayer3, '--dsw-specific-bubble-highlight')
      emit('--dsw-specific-bubble-highlight', bubHl[0], bubHl[1])

      if (input.light === '' && fl !== undefined) {
        emit('--dsw-specific-login-input', fl.input, tokens['--dsw-specific-login-input']?.dark ?? DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].dark)
      }
      if (input.dark === '' && fd !== undefined) {
        emit('--dsw-specific-login-input', tokens['--dsw-specific-login-input']?.light ?? DEFAULT_SURFACE_COLORS['--dsw-specific-input-major'].light, fd.input)
      }

      if (text.light === '' && fl !== undefined) {
        emit('--dsw-alias-label-primary', '#fafaf9', tokens['--dsw-alias-label-primary']?.dark ?? '#fafaf9')
        emit('--dsw-alias-label-secondary', '#d6d3d1', tokens['--dsw-alias-label-secondary']?.dark ?? '#d6d3d1')
        emit('--dsw-alias-label-tertiary', '#808285', tokens['--dsw-alias-label-tertiary']?.dark ?? '#808285')
        emit('--dsw-alias-label-caption', '#808285', tokens['--dsw-alias-label-caption']?.dark ?? '#808285')
        emit('--dsw-alias-menu-icon', '#d6d3d1', tokens['--dsw-alias-menu-icon']?.dark ?? '#d6d3d1')
        emit('--dsw-alias-label-primary-inverted', DARK_INK, tokens['--dsw-alias-label-primary-inverted']?.dark ?? DARK_INK)
        emit('--dsw-alias-label-primary-foreground', DARK_INK, tokens['--dsw-alias-label-primary-foreground']?.dark ?? DARK_INK)
      }
      if (text.dark === '' && fd !== undefined) {
        emit('--dsw-alias-label-primary', tokens['--dsw-alias-label-primary']?.light ?? '#0f1115', '#fafaf9')
        emit('--dsw-alias-label-secondary', tokens['--dsw-alias-label-secondary']?.light ?? '#61666b', '#d6d3d1')
        emit('--dsw-alias-label-tertiary', tokens['--dsw-alias-label-tertiary']?.light ?? '#9ea3a8', '#808285')
        emit('--dsw-alias-label-caption', tokens['--dsw-alias-label-caption']?.light ?? '#9ea3a8', '#808285')
        emit('--dsw-alias-menu-icon', tokens['--dsw-alias-menu-icon']?.light ?? '#61666b', '#d6d3d1')
        emit('--dsw-alias-label-primary-inverted', tokens['--dsw-alias-label-primary-inverted']?.light ?? LIGHT_INK, DARK_INK)
        emit('--dsw-alias-label-primary-foreground', tokens['--dsw-alias-label-primary-foreground']?.light ?? LIGHT_INK, DARK_INK)
      }

      const btnElev = getVal(flipButtonElevated, '--dsw-alias-button-elevated-fill')
      emit('--dsw-alias-button-elevated-fill', btnElev[0], btnElev[1])
      const btnFloat = getVal(flipButtonFloating, '--dsw-alias-button-floating-fill')
      emit('--dsw-alias-button-floating-fill', btnFloat[0], btnFloat[1])
      const btnHover = getVal(flipButtonFloatingHover, '--dsw-alias-button-floating-hover')
      emit('--dsw-alias-button-floating-hover', btnHover[0], btnHover[1])
      emit('--dsw-specific-sidebar-nav-item-active', btnElev[0], btnElev[1])
      emit('--dsw-specific-sidebar-nav-item-hover', btnHover[0], btnHover[1])
      emit('--dsw-specific-selector', btnFloat[0], btnFloat[1])
      emit('--dsw-alias-interactive-bg-hover', btnHover[0], btnHover[1])
      emit('--dsw-alias-interactive-bg-hover-solid', btnHover[0], btnHover[1])
    }
  }

  const bakeAlpha = (
    token: string,
    explicitLight: string | undefined,
    explicitDark: string | undefined,
    flipLight: string | undefined,
    flipDark: string | undefined,
    a: number,
  ): void => {
    const baseL = explicitLight === 'transparent' ? 'transparent'
      : (explicitLight !== undefined && explicitLight !== '' ? explicitLight
      : (flipLight !== undefined ? flipLight
      : (tokens[token]?.light ?? DEFAULT_SURFACE_COLORS[token]?.light ?? LIGHT_BASE)))

    const baseD = explicitDark === 'transparent' ? 'transparent'
      : (explicitDark !== undefined && explicitDark !== '' ? explicitDark
      : (flipDark !== undefined ? flipDark
      : (tokens[token]?.dark ?? DEFAULT_SURFACE_COLORS[token]?.dark ?? DARK_BASE)))

    // A transparent base means "let the background layer show through" — it
    // has no channel to bake an alpha into, and withAlpha() would emit an
    // invalid `rgba(NaN, NaN, NaN, a)` that drops the token.
    const bake = (base: string): string => (base === 'transparent' ? base : withAlpha(base, a))
    emit(token, bake(baseL), bake(baseD))
  }

  const bakeAccent = (token: string, a: number): void => {
    emit(token, withAlpha(lightAccent, a), withAlpha(darkAccent, a))
  }

  bakeAlpha('--dsw-specific-input-major', input.light, input.dark, flipInput[0], flipInput[1], inputAlpha)
  bakeAlpha('--dsw-alias-markdown-code-block', undefined, undefined, flipSidebar[0], flipSidebar[1], codeAlpha)
  bakeAlpha('--dsw-alias-markdown-code-block-banner', undefined, undefined, flipLayer2[0], flipLayer2[1], codeAlpha)

  if (surfaceAlpha < 1) {
    const alpha = surfaceAlpha
    const translucent = (
      token: string,
      explicitLight: string | undefined,
      explicitDark: string | undefined,
      flipL: string | undefined,
      flipD: string | undefined,
    ): void => {
      bakeAlpha(token, explicitLight, explicitDark, flipL, flipD, alpha)
    }

    translucent('--dsw-alias-bg-base', hasBackgroundMedia ? 'transparent' : bg.light, hasBackgroundMedia ? 'transparent' : bg.dark, undefined, undefined)
    translucent('--dsw-alias-bg-layer-1', panel.light, panel.dark, flipLayer1[0], flipLayer1[1])
    translucent(
      '--dsw-alias-bg-layer-2',
      panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.08) : undefined,
      panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.08) : undefined,
      flipLayer2[0],
      flipLayer2[1],
    )
    translucent('--dsw-alias-bg-layer-3', undefined, undefined, flipLayer3[0], flipLayer3[1])
    translucent('--dsw-alias-bg-overlay', undefined, undefined, flipOverlay[0], flipOverlay[1])
    translucent('--dsw-alias-bg-module-platform', undefined, undefined, flipMod[0], flipMod[1])
    translucent('--dsw-alias-bg-multi-select', undefined, undefined, flipLayer2[0], flipLayer2[1])

    if (!sidebarOpaque) {
      translucent(
        '--dsw-specific-sidebar-fill',
        panel.light || undefined,
        panel.dark || undefined,
        flipSidebar[0],
        flipSidebar[1],
      )
    }

    translucent(
      '--dsw-specific-bubble',
      panel.light || undefined,
      panel.dark || undefined,
      flipLayer2[0],
      flipLayer2[1],
    )
    translucent(
      '--dsw-specific-bubble-highlight',
      panel.light !== '' ? mixHex(panel.light, LIGHT_BASE, 0.12) : undefined,
      panel.dark !== '' ? mixHex(panel.dark, DARK_BASE, 0.12) : undefined,
      flipLayer3[0],
      flipLayer3[1],
    )

    const bakeControlTranslucent = (
      token: string,
      derived: [string, string] | undefined,
      flip: [string | undefined, string | undefined],
    ): void => {
      const valL = flip[0] ?? derived?.[0] ?? tokens[token]?.light ?? DEFAULT_SURFACE_COLORS[token]?.light ?? LIGHT_BASE
      const valD = flip[1] ?? derived?.[1] ?? tokens[token]?.dark ?? DEFAULT_SURFACE_COLORS[token]?.dark ?? DARK_BASE
      emit(token, withAlpha(valL, alpha), withAlpha(valD, alpha))
    }

    bakeControlTranslucent('--dsw-alias-button-elevated-fill', controlButtonFill, flipButtonElevated)
    bakeControlTranslucent('--dsw-alias-button-floating-fill', controlButtonFill, flipButtonFloating)
    bakeControlTranslucent('--dsw-alias-button-floating-hover', controlButtonHover, flipButtonFloatingHover)
    bakeControlTranslucent('--dsw-specific-sidebar-nav-item-active', controlNavActive, flipButtonElevated)
    bakeControlTranslucent('--dsw-specific-sidebar-nav-item-hover', controlNavHover, flipButtonFloatingHover)
    translucent('--dsw-specific-menu', undefined, undefined, flipLayer3[0], flipLayer3[1])
    translucent('--dsw-menu-surface-fill', undefined, undefined, flipLayer3[0], flipLayer3[1])
    translucent('--dsw-alias-fill-l1', undefined, undefined, flipMod[0], flipMod[1])
    translucent('--dsw-alias-fill-l2', undefined, undefined, flipMod[0], flipMod[1])
    bakeControlTranslucent('--dsw-alias-interactive-bg-hover', controlButtonHover, flipButtonFloatingHover)
    bakeControlTranslucent('--dsw-alias-interactive-bg-hover-solid', controlButtonHover, flipButtonFloatingHover)
    translucent('--dsw-specific-tip', undefined, undefined, flipMod[0], flipMod[1])

    const inlineCodeBaseL = hasAccentL ? lightAccent : '#4176e6'
    const inlineCodeBaseD = hasAccentD ? darkAccent : '#679efe'
    emit('--dsw-alias-markdown-inline-code', withAlpha(inlineCodeBaseL, emphasisAlpha), withAlpha(inlineCodeBaseD, emphasisAlpha))
  }

  if (surfaceAlpha < 1 || inputAlpha < 1) {
    bakeAccent('--dsw-alias-button-primary-fill', inputAlpha)
    bakeAccent('--dsw-alias-button-info-fill', inputAlpha)

    const bakeInputHover = (token: string, derivedLight?: string, derivedDark?: string): void => {
      const stock = DEFAULT_SURFACE_COLORS[token]
      const l = derivedLight ?? stock?.light
      const d = derivedDark ?? stock?.dark
      if (l !== undefined && d !== undefined) {
        emit(token, withAlpha(l, inputAlpha), withAlpha(d, inputAlpha))
      }
    }
    bakeInputHover('--dsw-alias-button-info-hover', lightInfoHover, darkInfoHover)
    bakeInputHover('--dsw-alias-button-primary-hover', lightPrimaryHover, darkPrimaryHover)

    const plusBaseL = flipButtonFloating[0] ?? controlButtonFill?.[0]
    const plusBaseD = flipButtonFloating[1] ?? controlButtonFill?.[1]
    if (plusBaseL !== undefined || plusBaseD !== undefined) {
      const pL = plusBaseL ?? DEFAULT_SURFACE_COLORS['--dsw-specific-selector'].light
      const pD = plusBaseD ?? DEFAULT_SURFACE_COLORS['--dsw-specific-selector'].dark
      emit('--dsw-specific-selector', withAlpha(pL, inputAlpha), withAlpha(pD, inputAlpha))
    } else {
      bakeAlpha('--dsw-specific-selector', undefined, undefined, undefined, undefined, inputAlpha)
    }
  }

  return tokens
}

/** One shipped preset: a starter set of role colors. */
export interface AppearancePreset {
  /** Preset id (persisted in the `preset` field). */
  id: string
  /** Role colors; absent roles keep the user's current value. */
  colors: Partial<Record<AppearanceRole, string>>
  /** Supported mode for this preset: 'light', 'dark', or 'both' (default 'both'). */
  mode?: 'light' | 'dark' | 'both'
}

/** Light mode starter presets. */
export const LIGHT_PRESETS: readonly AppearancePreset[] = [
  { id: 'default', colors: {}, mode: 'light' },
  {
    id: 'dawn',
    colors: {
      accent: '#d97706',
      background: '#fbfaf8',
      panel: '#f4f1ea',
      input: '#ffffff',
      text: '#292524',
      border: '#e7e5e4',
    },
    mode: 'light',
  },
  {
    id: 'sky',
    colors: {
      accent: '#0284c7',
      background: '#f0f9ff',
      panel: '#e0f2fe',
      input: '#ffffff',
      text: '#0f172a',
      border: '#bae6fd',
    },
    mode: 'light',
  },
  {
    id: 'mint',
    colors: {
      accent: '#059669',
      background: '#f0fdf4',
      panel: '#dcfce7',
      input: '#ffffff',
      text: '#14532d',
      border: '#bbf7d0',
    },
    mode: 'light',
  },
  {
    id: 'sakura',
    colors: {
      accent: '#db2777',
      background: '#fdf2f8',
      panel: '#fce7f3',
      input: '#ffffff',
      text: '#831843',
      border: '#fbcfe8',
    },
    mode: 'light',
  },
  {
    id: 'clay',
    colors: {
      accent: '#4b5563',
      background: '#f9fafb',
      panel: '#f3f4f6',
      input: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
    },
    mode: 'light',
  },
]

/** Dark mode starter presets. */
export const DARK_PRESETS: readonly AppearancePreset[] = [
  { id: 'default', colors: {}, mode: 'dark' },
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
    mode: 'dark',
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
    mode: 'dark',
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
    mode: 'dark',
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
    mode: 'dark',
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
    mode: 'dark',
  },
]

/** All shipped presets; combining dark and light catalogs. */
export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  ...DARK_PRESETS,
  ...LIGHT_PRESETS.filter(candidate => candidate.id !== 'default'),
]
