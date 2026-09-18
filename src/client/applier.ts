/**
 * DOM applier for appearance settings: owns one stylesheet and one fixed
 * background layer element. Forwards the active token overrides into
 * ctx.theme and exposes live CSS variables the stylesheet consumes. Every
 * write is retracted on dispose, so disabling the plugin restores the stock
 * UI exactly.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.theme Context merge (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceSettings } from '../appearance-settings.ts'
import { DEFAULT_SETTINGS } from '../appearance-settings.ts'
import { buildTokenOverrides, bubbleInk, OVERRIDE_SOURCE } from './tokens.ts'
import { getImage } from './image-store.ts'
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
  '--dsw-appearance-bubble-ink-light',
  '--dsw-appearance-bubble-ink-dark',
] as const

/**
 * Static sheet: the background layer is pushed to `z-index: -1` so it paints
 * below all content but above the body background — surfaces painted with
 * translucent tokens still show the image through, and no stacking context is
 * created on #root. `inset: -48px` gives the blur filter room so edges never
 * show transparent bleed.
 *
 * #root is deliberately left untouched: no `position`/`z-index`, no
 * `backdrop-filter`. A non-none backdrop-filter turns #root into the
 * containing block of every fixed-position descendant (menus, tooltips,
 * toasts), and any `z-index` traps those descendants in a stacking context
 * scoped to #root — whose own effective z then sits at the page level. Either
 * would let top-level third-party panels (e.g. dsh-better-sidebar's
 * `position: fixed; z-index: 40` panel) paint over the DSH settings dialog
 * (`position: fixed; z-index: 1000`, a descendant of #root). Pushing the
 * wallpaper layer to -1 instead of lifting #root keeps fixed overlays at the
 * top level, so the dialog always wins. Blurring the wallpaper directly is
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
  z-index: -1;
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
#root ::selection {
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
#root :focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
/* Freeze transitions during active slider / color-picker drags so rapid
   token updates (like input opacity applied to the send button) render at
   60fps without jitter. data-dsw-sliding is set by the row's drag handlers;
   the :active color-input rule is a belt-and-suspenders for the native
   picker keeping focus without pointer events. */
body:has(input[type="range"]:active) *,
body:has(input[type="color"]:active) *,
body[data-dsw-sliding] * {
  transition-duration: 0s !important;
}
/* Accent auto-inversion: the user bubble paints its background with
   --dsw-specific-bubble (= accent) but its text with the GLOBAL
   --dsw-alias-label-primary (there is no bubble foreground token), so a dark
   accent + dark text is unreadable. Scope the text variable to the bubble
   subtree only — CSS custom properties inherit through its DOM, so markdown
   and links referencing the token follow too — and gate it on a body
   attribute the applier sets per mode, so turning the toggle off / disabling
   the plugin restores the stock color exactly. The hashed class prefix
   (Sixlwa_) changes across host builds; the stable local name is 'bubble'. */
body[data-dsw-bubble-ink-light] #root [class*="_bubble"],
body[data-dsw-bubble-ink-light] #root [class*="bubble" i] {
  --dsw-alias-label-primary: var(--dsw-appearance-bubble-ink-light);
  --dsw-alias-label-secondary: var(--dsw-appearance-bubble-ink-light);
}
body[data-dsw-bubble-ink-light] #root [class*="_bubble"] a,
body[data-dsw-bubble-ink-light] #root [class*="bubble" i] a {
  color: inherit;
  text-decoration: underline;
}
body[data-ds-dark-theme][data-dsw-bubble-ink-dark] #root [class*="_bubble"],
body[data-ds-dark-theme][data-dsw-bubble-ink-dark] #root [class*="bubble" i] {
  --dsw-alias-label-primary: var(--dsw-appearance-bubble-ink-dark);
  --dsw-alias-label-secondary: var(--dsw-appearance-bubble-ink-dark);
}
body[data-ds-dark-theme][data-dsw-bubble-ink-dark] #root [class*="_bubble"] a,
body[data-ds-dark-theme][data-dsw-bubble-ink-dark] #root [class*="bubble" i] a {
  color: inherit;
  text-decoration: underline;
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
  private imageToken = ''
  private imageUrl: string | undefined
  private removeOverrides: (() => void) | undefined
  private videoFailed = false

  /**
   * Notified when the background video stops being playable (unsupported
   * codec, decode error) or becomes playable again. The row has no other way
   * to learn that an uploaded video never reached the screen, so it surfaces
   * this as a hint instead of leaving a silent, invisible background.
   */
  onVideoPlaybackError: ((failed: boolean) => void) | undefined

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
    const oldRemove = this.removeOverrides
    const tokens = buildTokenOverrides(value)
    this.removeOverrides = Object.keys(tokens).length > 0
      ? this.ctx.theme.overrideTokens(OVERRIDE_SOURCE, tokens)
      : undefined
    oldRemove?.()
    const body = document.body
    // The wallpaper rides a CSS variable like every other knob; the value is
    // a record key (or legacy inline data URL) and resolves asynchronously.
    void this.syncImage(value.backgroundImage)
    body.style.setProperty('--dsw-appearance-bg-opacity', String(value.backgroundOpacity))
    // 背景模糊 and 毛玻璃 ride the same wallpaper-layer filter: dragging either
    // slider deepens the blur of the wallpaper that the translucent surfaces
    // reveal. The panels themselves are never touched.
    body.style.setProperty(
      '--dsw-appearance-blur',
      `${value.backgroundBlur + value.glassBlur}px`,
    )
    // 毛玻璃 also drives the host's modal masks: dialogs/dropdowns dim the page
    // through `.mask` elements whose backdrop-filter is `var(--dsw-mask-blur)`
    // (stock: blur(2px)). Writing the token on body wins over the host's
    // stylesheet definitions (body is the closer ancestor), so whatever a mask
    // covers — text included — frosts with the slider. The slider owns the
    // token across its whole range: 0 means blur(0px) (fully clear), NOT the
    // stock 2px. dispose() removes the write so uninstall restores stock.
    body.style.setProperty('--dsw-mask-blur', `blur(${value.glassBlur}px)`)
    body.style.setProperty('--dsw-appearance-scrim', String(value.scrim))
    // Accent auto-inversion: scope the bubble text token to a contrast ink.
    // The stylesheet rules only match while the per-mode gate attribute is
    // present, so a null ink (toggle off) retracts the override entirely.
    const ink = bubbleInk(value)
    this.applyBubbleInk('light', ink.light)
    this.applyBubbleInk('dark', ink.dark)
    // A background video (IndexedDB record key) replaces the image layer;
    // loading is async and only re-runs when the key changes.
    void this.syncVideo(value.backgroundVideo)
  }

  /**
   * Set or retract the per-mode bubble text ink. Writes a body custom
   * property with the color and a gate attribute that arms the scoped
   * stylesheet rule.
   * @param mode - theme mode the ink is computed for.
   * @param hex - contrast ink color, or null to retract the override.
   */
  private applyBubbleInk(mode: 'light' | 'dark', hex: string | null): void {
    const body = document.body
    const attr = `data-dsw-bubble-ink-${mode}`
    const variable = `--dsw-appearance-bubble-ink-${mode}`
    if (hex === null) {
      body.removeAttribute(attr)
      body.style.removeProperty(variable)
    } else {
      body.setAttribute(attr, '')
      body.style.setProperty(variable, hex)
    }
  }

  /**
   * Load or clear the wallpaper for a background token. Legacy records still
   * carry an inline data URL (applied directly); current records hold an
   * IndexedDB key resolved through an object URL. Reuses the object URL when
   * the token is unchanged, so repeated applies never re-read IndexedDB.
   * @param token - record key, legacy data URL, or '' to clear.
   */
  private async syncImage(token: string): Promise<void> {
    if (token === this.imageToken) return
    this.imageToken = token
    this.teardownImage()
    const body = document.body
    if (token === '') {
      body.style.setProperty('--dsw-appearance-bg-image', 'none')
      return
    }
    if (token.startsWith('data:')) {
      body.style.setProperty('--dsw-appearance-bg-image', `url("${token}")`)
      return
    }
    const blob = await getImage(token)
    if (this.imageToken !== token) {
      // Superseded by a newer apply; the newer syncImage owns the variable.
      return
    }
    if (blob === undefined) {
      // Deleted while loading: fall back to no wallpaper.
      this.imageToken = ''
      body.style.setProperty('--dsw-appearance-bg-image', 'none')
      return
    }
    this.imageUrl = URL.createObjectURL(blob)
    body.style.setProperty('--dsw-appearance-bg-image', `url("${this.imageUrl}")`)
  }

  /** Revoke the wallpaper object URL, if any. */
  private teardownImage(): void {
    if (this.imageUrl !== undefined) {
      URL.revokeObjectURL(this.imageUrl)
      this.imageUrl = undefined
    }
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
      this.reportVideoError(false)
      return
    }
    const record = await getVideo(key)
    if (record === undefined || this.videoKey !== key) {
      // Deleted while loading, or superseded by a newer apply.
      this.videoKey = ''
      this.layer.removeAttribute('data-video')
      this.reportVideoError(false)
      return
    }
    const video = this.ensureVideo()
    this.videoUrl = URL.createObjectURL(record)
    video.src = this.videoUrl
    // Unsupported codec (e.g. HEVC in an mp4): drop the video layer so the
    // wallpaper fallback (if any) shows instead of a black frame, and tell the
    // row — otherwise the failure is indistinguishable from "no background".
    video.onerror = (): void => {
      this.videoKey = ''
      this.layer.removeAttribute('data-video')
      this.teardownVideo()
      this.reportVideoError(true)
    }
    // Decoding started: the codec is supported after all (a swapped-in video
    // may recover from a previous failure).
    video.onloadeddata = (): void => { this.reportVideoError(false) }
    this.layer.setAttribute('data-video', '')
    video.play().catch(() => {
      // Autoplay policy or unsupported codec: keep the layer fallback silent.
      // `onerror` owns the unsupported-codec report; a play() rejection on its
      // own is not a decode failure and must not claim one.
    })
  }

  /**
   * Report a change in the background video's playability, at most once per
   * state so a settings re-apply cannot spam the row's store.
   * @param failed - whether the video is currently unplayable.
   */
  private reportVideoError(failed: boolean): void {
    if (this.videoFailed === failed) return
    this.videoFailed = failed
    this.onVideoPlaybackError?.(failed)
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
    // Drop the keys BEFORE tearing down: a getVideo()/getImage() still in
    // flight resolves after dispose, and the key comparison is what stops it
    // from recreating media on the removed layer.
    this.videoKey = ''
    this.teardownVideo()
    this.imageToken = ''
    this.teardownImage()
    this.style.remove()
    this.layer.remove()
    const body = document.body
    for (const name of BODY_VARIABLES) body.style.removeProperty(name)
    body.style.removeProperty('--dsw-mask-blur')
    body.removeAttribute('data-dsw-bubble-ink-light')
    body.removeAttribute('data-dsw-bubble-ink-dark')
    body.removeAttribute('data-dsw-sliding')
  }
}
