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
import { getVideo } from './video-store.ts'

/** Background layer element id (the stylesheet targets it). */
export const BG_LAYER_ID = 'dsw-appearance-bg'
/** Stylesheet element id owned by this plugin. */
export const STYLE_ID = 'dsw-appearance-styles'

/** CSS variables the applier writes on body, consumed by the stylesheet. */
const BODY_VARIABLES = [
  '--dsw-appearance-bg-image',
  '--dsw-appearance-bg-opacity',
  '--dsw-appearance-blur',
  '--dsw-appearance-scrim',
] as const

/**
 * Static sheet: the background layer sits above the body background but below
 * #root (lifted with a minimal stacking context), so surfaces painted with
 * translucent tokens show the image through. `inset: -48px` gives the blur
 * filter room so edges never show transparent bleed.
 *
 * The blur is applied to the LAYER itself (`--dsw-appearance-blur`, the sum
 * of the wallpaper blur and glass sliders), never `backdrop-filter` on
 * #root: a non-none backdrop-filter turns #root into the containing block of
 * every fixed-position descendant (menus, tooltips, toasts), which re-anchors
 * them to #root instead of the viewport. Blurring the wallpaper directly is
 * visually equivalent here — the only thing behind #root is this layer — and
 * leaves fixed positioning alone.
 *
 * The readability scrim rides inside the layer's own background-image stack:
 * a uniform veil whose alpha is `var(--dsw-appearance-scrim)` — the browser
 * re-rasterizes the layer live as the slider moves, no JS wiring needed.
 * The veil hue follows the base theme (white-ish in light mode, near-black in
 * dark mode). Selection and focus rings follow the user's accent through the
 * overridden brand tokens.
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
  background-image:
    linear-gradient(rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 0%, rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
  opacity: var(--dsw-appearance-bg-opacity, 1);
  filter: blur(var(--dsw-appearance-blur, 0px));
}
#${BG_LAYER_ID} video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
}
#${BG_LAYER_ID}[data-video] video {
  display: block;
}
#${BG_LAYER_ID}[data-video] {
  background-image: none;
}
body[data-ds-dark-theme] #${BG_LAYER_ID} {
  background-image:
    linear-gradient(rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 0%, rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
}
#root {
  position: relative;
  z-index: 1;
}
#root ::selection {
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
#root :focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
`

/**
 * Projects one appearance settings snapshot onto the document. Replaces the
 * token override layer on every apply; retracts everything in dispose.
 */
export class AppearanceApplier {
  private readonly style: HTMLStyleElement
  private readonly layer: HTMLDivElement
  private videoEl: HTMLVideoElement | undefined
  private videoUrl: string | undefined
  private videoKey = ''
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
    // Wallpaper blur and glass share one filter on the layer: `backdrop-filter`
    // on #root would re-anchor fixed-position descendants (see the sheet note).
    body.style.setProperty('--dsw-appearance-blur', `${value.backgroundBlur + value.glassBlur}px`)
    body.style.setProperty('--dsw-appearance-scrim', String(value.scrim))
    // A background video (IndexedDB record key) replaces the image layer;
    // loading is async and only re-runs when the key changes.
    void this.syncVideo(value.backgroundVideo)
  }

  /**
   * Load or clear the background video for a record key. Reuses the element
   * and object URL when the key is unchanged, so repeated applies never
   * re-read IndexedDB.
   * @param key - video record key, or '' to clear.
   */
  private async syncVideo(key: string): Promise<void> {
    if (key === this.videoKey) return
    this.videoKey = key
    this.teardownVideo()
    if (key === '') {
      this.layer.removeAttribute('data-video')
      return
    }
    const record = await getVideo(key)
    if (record === undefined || this.videoKey !== key) {
      // Deleted while loading, or superseded by a newer apply.
      this.videoKey = ''
      this.layer.removeAttribute('data-video')
      return
    }
    const video = this.ensureVideo()
    this.videoUrl = URL.createObjectURL(record)
    video.src = this.videoUrl
    video.play().catch(() => {
      // Autoplay policy or unsupported codec: keep the layer fallback silent.
    })
    // Unsupported codec (e.g. HEVC in an mp4): drop the video layer so the
    // wallpaper fallback (if any) shows instead of a black frame.
    video.onerror = (): void => {
      this.videoKey = ''
      this.layer.removeAttribute('data-video')
      this.teardownVideo()
    }
    this.layer.setAttribute('data-video', '')
  }

  /** Create the background video element once. */
  private ensureVideo(): HTMLVideoElement {
    if (this.videoEl === undefined) {
      const video = document.createElement('video')
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.autoplay = true
      this.layer.append(video)
      this.videoEl = video
    }
    return this.videoEl
  }

  /** Remove the video element and revoke its object URL. */
  private teardownVideo(): void {
    this.videoEl?.remove()
    this.videoEl = undefined
    if (this.videoUrl !== undefined) {
      URL.revokeObjectURL(this.videoUrl)
      this.videoUrl = undefined
    }
  }

  /** Retract the override layer, the stylesheet, the layer element, and body variables. */
  dispose(): void {
    this.removeOverrides?.()
    this.removeOverrides = undefined
    // Drop the video key BEFORE tearing down: a getVideo() still in flight
    // resolves after dispose, and the key comparison is what stops it from
    // recreating the video element on the removed layer.
    this.videoKey = ''
    this.teardownVideo()
    this.style.remove()
    this.layer.remove()
    const body = document.body
    for (const name of BODY_VARIABLES) body.style.removeProperty(name)
  }
}
