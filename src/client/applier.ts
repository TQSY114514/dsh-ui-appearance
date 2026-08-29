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
import { buildTokenOverrides, OVERRIDE_SOURCE } from './tokens.ts'
import { getImage } from './image-store.ts'
import { getVideo } from './video-store.ts'
import { WebGlSceneRuntime } from './scene-webgl/index.ts'

/** Background layer element id (the stylesheet targets it). */
export const BG_LAYER_ID = 'dsw-appearance-bg'
/** Stylesheet element id owned by this plugin. */
export const STYLE_ID = 'dsw-appearance-styles'

/** CSS variables the applier writes on body, consumed by the stylesheet. */
const BODY_VARIABLES = [
  '--dsw-appearance-bg-image',
  '--dsw-appearance-bg-opacity',
  '--dsw-appearance-blur',
  '--dsw-appearance-scale',
  '--dsw-appearance-scrim',
] as const

/**
 * Static sheet: the background layer is pushed to `z-index: -1` so it paints
 * below all content but above the body background — surfaces painted with
 * translucent tokens still show the image through, and no stacking context is
 * created on #root.
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
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  opacity: var(--dsw-appearance-bg-opacity, 1);
  filter: blur(var(--dsw-appearance-blur, 0px));
  transform: var(--dsw-appearance-scale, none);
}

/* Landscape static image background */
#${BG_LAYER_ID}:not([data-portrait]):not([data-video]) {
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-image:
    linear-gradient(rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 0%, rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
}

body[data-ds-dark-theme] #${BG_LAYER_ID}:not([data-portrait]):not([data-video]) {
  background-image:
    linear-gradient(rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 0%, rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
}

/* Portrait static image background: blur-extend background + centered contain foreground */
#${BG_LAYER_ID}[data-portrait]:not([data-video]) {
  background-image: none !important;
}

#${BG_LAYER_ID}[data-portrait]:not([data-video])::before {
  content: '';
  position: absolute;
  inset: -40px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-image: var(--dsw-appearance-bg-image, none);
  filter: blur(40px) brightness(0.85);
  transform: scale(1.2);
}

#${BG_LAYER_ID}[data-portrait]:not([data-video])::after {
  content: '';
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  background-image:
    linear-gradient(rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 0%, rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
}

body[data-ds-dark-theme] #${BG_LAYER_ID}[data-portrait]:not([data-video])::after {
  background-image:
    linear-gradient(rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 0%, rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 100%),
    var(--dsw-appearance-bg-image, none);
}

/* Video background */
#${BG_LAYER_ID} video {
  display: none;
}

#${BG_LAYER_ID}[data-video] video.dsw-video-fg {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Portrait video mode */
#${BG_LAYER_ID}[data-video][data-portrait] video.dsw-video-blur {
  display: block;
  position: absolute;
  inset: -30px;
  width: calc(100% + 60px);
  height: calc(100% + 60px);
  object-fit: cover;
  filter: blur(35px) brightness(0.85);
  transform: scale(1.15);
}

#${BG_LAYER_ID}[data-video][data-portrait] video.dsw-video-fg {
  object-fit: contain;
}

#${BG_LAYER_ID}[data-video]::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, var(--dsw-appearance-scrim, 0));
  pointer-events: none;
}

body[data-ds-dark-theme] #${BG_LAYER_ID}[data-video]::after {
  background: rgba(8, 10, 18, var(--dsw-appearance-scrim, 0));
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
  private videoBlurEl: HTMLVideoElement | undefined
  private videoUrl: string | undefined
  private videoKey = ''
  private imageToken = ''
  private imageUrl: string | undefined
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
    // The wallpaper rides a CSS variable like every other knob; the value is
    // a record key (or legacy inline data URL) and resolves asynchronously.
    void this.syncImage(value.backgroundImage)
    body.style.setProperty('--dsw-appearance-bg-opacity', String(value.backgroundOpacity))
    // 背景模糊 and 毛玻璃 ride the same wallpaper-layer filter: dragging either
    // slider deepens the blur of the wallpaper that the translucent surfaces
    // reveal. The panels themselves are never touched.
    const totalBlur = value.backgroundBlur + value.glassBlur
    body.style.setProperty(
      '--dsw-appearance-blur',
      `${totalBlur}px`,
    )
    if (totalBlur > 0) {
      body.style.setProperty('--dsw-appearance-scale', `scale(${1 + Math.min(0.08, totalBlur * 0.003)})`)
    } else {
      body.style.setProperty('--dsw-appearance-scale', 'none')
    }
    // 毛玻璃 also drives the host's modal masks: dialogs/dropdowns dim the page
    // through `.mask` elements whose backdrop-filter is `var(--dsw-mask-blur)`
    // (stock: blur(2px)). Writing the token on body wins over the host's
    // stylesheet definitions (body is the closer ancestor), so whatever a mask
    // covers — text included — frosts with the slider. The slider owns the
    // token across its whole range: 0 means blur(0px) (fully clear), NOT the
    // stock 2px. dispose() removes the write so uninstall restores stock.
    body.style.setProperty('--dsw-mask-blur', `blur(${value.glassBlur}px)`)
    body.style.setProperty('--dsw-appearance-scrim', String(value.scrim))
    // A background video (IndexedDB record key) replaces the image layer;
    // loading is async and only re-runs when the key changes.
    void this.syncVideo(value.backgroundVideo)
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
      this.checkImageAspect(token, token)
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
    this.checkImageAspect(this.imageUrl, token)
  }

  /** Check image aspect ratio to enable portrait blur-extend layout when vertical. */
  private checkImageAspect(src: string, token: string): void {
    const img = new Image()
    img.onload = (): void => {
      if (this.imageToken !== token) return
      if (img.naturalHeight > 0 && img.naturalWidth > 0 && (img.naturalWidth / img.naturalHeight) < 1.25) {
        this.layer.setAttribute('data-portrait', '')
      } else {
        this.layer.removeAttribute('data-portrait')
      }
    }
    img.onerror = (): void => {
      if (this.imageToken === token) this.layer.removeAttribute('data-portrait')
    }
    img.src = src
  }

  /** Revoke the wallpaper object URL, if any. */
  private teardownImage(): void {
    this.layer.removeAttribute('data-portrait')
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
    if (this.videoBlurEl !== undefined) this.videoBlurEl.src = this.videoUrl
    video.play().catch(() => {
      // Autoplay policy or unsupported codec: keep the layer fallback silent.
    })
    this.videoBlurEl?.play().catch(() => {})
    // Check if video is vertical on metadata load
    video.onloadedmetadata = (): void => {
      if (this.videoKey !== key) return
      if (video.videoHeight > 0 && video.videoWidth > 0 && (video.videoWidth / video.videoHeight) < 1.25) {
        this.layer.setAttribute('data-portrait', '')
      } else {
        this.layer.removeAttribute('data-portrait')
      }
    }
    // Unsupported codec (e.g. HEVC in an mp4): drop the video layer so the
    // wallpaper fallback (if any) shows instead of a black frame.
    video.onerror = (): void => {
      this.videoKey = ''
      this.layer.removeAttribute('data-video')
      this.teardownVideo()
    }
    this.layer.setAttribute('data-video', '')
  }

  /** Create the background video elements (foreground and blur-extend). */
  private ensureVideo(): HTMLVideoElement {
    if (this.videoEl === undefined) {
      const blurVideo = document.createElement('video')
      blurVideo.muted = true
      blurVideo.loop = true
      blurVideo.playsInline = true
      blurVideo.autoplay = true
      blurVideo.className = 'dsw-video-blur'

      const video = document.createElement('video')
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.autoplay = true
      video.className = 'dsw-video-fg'

      this.layer.append(blurVideo, video)
      this.videoBlurEl = blurVideo
      this.videoEl = video
    }
    return this.videoEl
  }

  /** Remove the video element and revoke its object URL. */
  private teardownVideo(): void {
    this.layer.removeAttribute('data-portrait')
    this.videoEl?.remove()
    this.videoEl = undefined
    this.videoBlurEl?.remove()
    this.videoBlurEl = undefined
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
    this.sceneRuntime?.dispose()
    this.sceneRuntime = undefined
    this.style.remove()
    this.layer.remove()
    const body = document.body
    for (const name of BODY_VARIABLES) body.style.removeProperty(name)
    body.style.removeProperty('--dsw-mask-blur')
  }
}
