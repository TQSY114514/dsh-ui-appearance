/**
 * DOM applier for appearance settings: owns one stylesheet and one fixed
 * background layer element, forwards the active token overrides into
 * ctx.theme, and exposes live CSS variables the stylesheet consumes. Every
 * write is retracted on dispose, so disabling the plugin restores the stock
 * UI exactly.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.theme Context merge (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceSettings } from '../appearance-settings.ts'
import { DEFAULT_SETTINGS } from '../appearance-settings.ts'
import { buildTokenOverrides, OVERRIDE_SOURCE } from './tokens.ts'

/** Background layer element id (the stylesheet targets it). */
export const BG_LAYER_ID = 'dsw-appearance-bg'
/** Stylesheet element id owned by this plugin. */
export const STYLE_ID = 'dsw-appearance-styles'
/** Body class enabling the glass backdrop-filter rule. */
export const GLASS_CLASS = 'dsw-appearance-glass'

/** CSS variables the applier writes on body, consumed by the stylesheet. */
const BODY_VARIABLES = [
  '--dsw-appearance-bg-image',
  '--dsw-appearance-bg-opacity',
  '--dsw-appearance-bg-blur',
  '--dsw-appearance-glass-blur',
] as const

/**
 * Static sheet: the background layer sits above the body background but below
 * #root (lifted with a minimal stacking context), so surfaces painted with
 * translucent tokens show the image through; the glass rule blurs whatever
 * paints behind #root (the image layer). `inset: -48px` gives the blur filter
 * room so edges never show transparent bleed.
 */
const SHEET = `
#${BG_LAYER_ID} {
  position: fixed;
  inset: -48px;
  z-index: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-image: var(--dsw-appearance-bg-image, none);
  opacity: var(--dsw-appearance-bg-opacity, 1);
  filter: blur(var(--dsw-appearance-bg-blur, 0px));
}
#root {
  position: relative;
  z-index: 1;
}
body.${GLASS_CLASS} #root {
  backdrop-filter: blur(var(--dsw-appearance-glass-blur, 0px));
}
`

/**
 * Projects one appearance settings snapshot onto the document. Replaces the
 * token override layer on every apply; retracts everything in dispose.
 */
export class AppearanceApplier {
  private readonly style: HTMLStyleElement
  private readonly layer: HTMLDivElement
  private removeOverrides: (() => void) | undefined

  /**
   * @param ctx - client context providing the theme service.
   */
  constructor(private readonly ctx: ClientContext) {
    this.style = document.createElement('style')
    this.style.id = STYLE_ID
    this.style.textContent = SHEET
    document.head.append(this.style)
    this.layer = document.createElement('div')
    this.layer.id = BG_LAYER_ID
    document.body.prepend(this.layer)
  }

  /**
   * Apply a settings snapshot: rebuild the theme override layer and refresh
   * the body CSS variables. Undefined values (settings not yet loaded) apply
   * the stock defaults, which removes the override layer.
   * @param settings - current appearance settings or undefined while loading.
   */
  apply(settings: AppearanceSettings | undefined): void {
    const value = settings ?? DEFAULT_SETTINGS
    this.removeOverrides?.()
    this.removeOverrides = undefined
    const tokens = buildTokenOverrides(value)
    if (Object.keys(tokens).length > 0) {
      this.removeOverrides = this.ctx.theme.overrideTokens(OVERRIDE_SOURCE, tokens)
    }
    const body = document.body
    body.style.setProperty(
      '--dsw-appearance-bg-image',
      value.backgroundImage === '' ? 'none' : `url("${value.backgroundImage}")`,
    )
    body.style.setProperty('--dsw-appearance-bg-opacity', String(value.backgroundOpacity))
    body.style.setProperty('--dsw-appearance-bg-blur', `${value.backgroundBlur}px`)
    body.style.setProperty('--dsw-appearance-glass-blur', `${value.glassBlur}px`)
    body.classList.toggle(GLASS_CLASS, value.glassBlur > 0)
  }

  /** Retract the override layer, the stylesheet, the layer element, and body variables. */
  dispose(): void {
    this.removeOverrides?.()
    this.removeOverrides = undefined
    this.style.remove()
    this.layer.remove()
    const body = document.body
    for (const name of BODY_VARIABLES) body.style.removeProperty(name)
    body.classList.remove(GLASS_CLASS)
  }
}
