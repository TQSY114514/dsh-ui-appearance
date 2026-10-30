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
import { buildTokenOverrides, bubbleInk, onInk, OVERRIDE_SOURCE, selectionColors } from './tokens.ts'
import { mixHex, withAlpha } from './color.ts'
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
  '--dsw-appearance-bg-base-light',
  '--dsw-appearance-bg-base-dark',
  '--dsw-appearance-blur',
  '--dsw-appearance-glass-filter',
  '--dsw-appearance-scrim',
  '--dsw-appearance-selection-bg-light',
  '--dsw-appearance-selection-fg-light',
  '--dsw-appearance-selection-bg-dark',
  '--dsw-appearance-selection-fg-dark',
  '--dsw-appearance-bubble-selection-bg-light',
  '--dsw-appearance-bubble-selection-fg-light',
  '--dsw-appearance-bubble-selection-bg-dark',
  '--dsw-appearance-bubble-selection-fg-dark',
  '--dsw-appearance-bubble-ink-light',
  '--dsw-appearance-bubble-ink-dark',
  '--dsw-appearance-bubble-ink-fg-light',
  '--dsw-appearance-bubble-ink-fg-dark',
  '--dsw-appearance-modal-l1-light',
  '--dsw-appearance-modal-l1-dark',
  '--dsw-appearance-modal-l2-light',
  '--dsw-appearance-modal-l2-dark',
  '--dsw-appearance-modal-l3-light',
  '--dsw-appearance-modal-l3-dark',
  '--dsw-appearance-modal-overlay-light',
  '--dsw-appearance-modal-overlay-dark',
  '--dsw-appearance-modal-mod-light',
  '--dsw-appearance-modal-mod-dark',
  '--dsw-appearance-modal-nav-active-light',
  '--dsw-appearance-modal-nav-active-dark',
  '--dsw-appearance-modal-nav-hover-light',
  '--dsw-appearance-modal-nav-hover-dark',
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
 * Three-layer composition:
 * 1. Base canvas: holds the user's customized background color (or mode fallback).
 * 2. Media layer (::before / video): paints wallpaper with opacity and blur.
 *    Lowering opacity smoothly blends the media into the base canvas color.
 * 3. Scrim layer (::after): applies the uniform readability veil on top of media.
 */
const SHEET = `
#${BG_LAYER_ID} {
  position: fixed;
  inset: -48px;
  z-index: -1;
  pointer-events: none;
  background-color: var(--dsw-appearance-bg-base-light, #ffffff);
}
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) #${BG_LAYER_ID} {
  background-color: var(--dsw-appearance-bg-base-dark, #151517);
}
#${BG_LAYER_ID}::before {
  content: "";
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-image: var(--dsw-appearance-bg-image, none);
  opacity: var(--dsw-appearance-bg-opacity, 1);
  filter: blur(var(--dsw-appearance-blur, 0px));
}
#${BG_LAYER_ID}[data-video]::before {
  display: none;
}
#${BG_LAYER_ID} video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
  opacity: var(--dsw-appearance-bg-opacity, 1);
  filter: blur(var(--dsw-appearance-blur, 0px));
}
#${BG_LAYER_ID}[data-video] video {
  display: block;
}
#${BG_LAYER_ID}::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 0%,
    rgba(255, 255, 255, var(--dsw-appearance-scrim, 0)) 100%
  );
}
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) #${BG_LAYER_ID}::after {
  background: linear-gradient(
    rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 0%,
    rgba(8, 10, 18, var(--dsw-appearance-scrim, 0)) 100%
  );
}
/* Windows desktop host frame punch-out (Issue #31):
   In DSH 0.2.0 desktop on Windows, [data-windows-titlebar] adds an opaque
   "background: var(--dsw-specific-sidebar-fill)" to the three-column outer frame
   (.BynINW_frame) and its titlebar drag strip (:before). Because this outer frame
   encloses the entire viewport, its opaque sidebar-fill completely covers the
   #dsw-appearance-bg layer, preventing the wallpaper from showing on the main
   chat area until surfaceAlpha reduces the sidebar fill's opacity.
   On macOS the host natively sets "[data-platform=darwin] .BynINW_frame { background: 0 0 }".
   When background media is active (data-dsw-has-bg), punch out the Windows frame
   and its drag strip to transparent so the wallpaper reveals through the main canvas,
   aligning Windows desktop behavior with Web and macOS. */
html[data-dsw-has-bg][data-windows-titlebar] [class*="_frame"],
html[data-dsw-has-bg] [data-windows-titlebar] [class*="_frame"] {
  background: transparent !important;
}
html[data-dsw-has-bg][data-windows-titlebar] [class*="_frame"]:before,
html[data-dsw-has-bg] [data-windows-titlebar] [class*="_frame"]:before {
  background: transparent !important;
}
#root ::selection {
  background: var(--dsw-appearance-selection-bg-light, var(--dsw-alias-brand-primary));
  color: var(--dsw-appearance-selection-fg-light, var(--dsw-alias-label-primary-foreground));
}
#root :is([class*="_bubble"], [class*="bubble" i])::selection,
#root :is([class*="_bubble"], [class*="bubble" i]) ::selection {
  background: var(--dsw-appearance-bubble-selection-bg-light, var(--dsw-alias-brand-primary));
  color: var(--dsw-appearance-bubble-selection-fg-light, var(--dsw-alias-label-primary-foreground));
}
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) #root ::selection {
  background: var(--dsw-appearance-selection-bg-dark, var(--dsw-alias-brand-primary));
  color: var(--dsw-appearance-selection-fg-dark, var(--dsw-alias-label-primary-foreground));
}
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) #root :is([class*="_bubble"], [class*="bubble" i])::selection,
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) #root :is([class*="_bubble"], [class*="bubble" i]) ::selection {
  background: var(--dsw-appearance-bubble-selection-bg-dark, var(--dsw-alias-brand-primary));
  color: var(--dsw-appearance-bubble-selection-fg-dark, var(--dsw-alias-label-primary-foreground));
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
/* User-message bubble legibility (Issue #27): the user bubble background is
   painted with --dsw-specific-bubble (= accent), while inline file/skill/session
   reference chips (.refChip in user-text.module.css) use
   color: var(--dsw-alias-state-business-primary) (= also accent). Without
   scoping, accent text on an accent bubble has a 1:1 contrast ratio and
   becomes invisible regardless of whether accent auto-inversion is on.
   Pointing the business/brand foreground tokens at --dsw-alias-label-primary
   inside the bubble ensures reference chips always inherit the bubble's
   readable foreground ink (either the user's text role or the auto-inverted
   bubble ink below), while a subtle translucent pill + underline preserves
   chip distinction. */
#root [class*="_bubble"],
#root [class*="bubble" i] {
  --dsw-alias-state-business-primary: var(--dsw-alias-label-primary);
  --dsw-alias-brand-primary: var(--dsw-alias-label-primary);
  --dsw-alias-label-primary-foreground: var(--dsw-alias-label-primary-inverted);
}
#root [class*="_bubble"] [class*="refChip"],
#root [class*="bubble" i] [class*="refChip"] {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  padding: 1px 6px;
  border-radius: 6px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
html:not([data-ds-dark-theme]):not([data-theme="dark"]) body[data-dsw-bubble-ink-light]:not([data-ds-dark-theme]):not([data-theme="dark"]) #root :is([class*="_bubble"], [class*="bubble" i]) {
  --dsw-alias-label-primary: var(--dsw-appearance-bubble-ink-light);
  --dsw-alias-label-secondary: var(--dsw-appearance-bubble-ink-light);
  --dsw-alias-state-business-primary: var(--dsw-appearance-bubble-ink-light);
  --dsw-alias-brand-primary: var(--dsw-appearance-bubble-ink-light);
  --dsw-alias-label-primary-inverted: var(--dsw-appearance-bubble-ink-fg-light);
  --dsw-alias-label-primary-foreground: var(--dsw-appearance-bubble-ink-fg-light);
}
html:not([data-ds-dark-theme]):not([data-theme="dark"]) body[data-dsw-bubble-ink-light]:not([data-ds-dark-theme]):not([data-theme="dark"]) #root :is([class*="_bubble"], [class*="bubble" i]) a {
  color: inherit;
  text-decoration: underline;
}
:is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-bubble-ink-dark] #root [class*="_bubble"],
:is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-bubble-ink-dark] #root [class*="bubble" i],
:is(body[data-ds-dark-theme], body[data-theme="dark"])[data-dsw-bubble-ink-dark] #root [class*="_bubble"],
:is(body[data-ds-dark-theme], body[data-theme="dark"])[data-dsw-bubble-ink-dark] #root [class*="bubble" i] {
  --dsw-alias-label-primary: var(--dsw-appearance-bubble-ink-dark);
  --dsw-alias-label-secondary: var(--dsw-appearance-bubble-ink-dark);
  --dsw-alias-state-business-primary: var(--dsw-appearance-bubble-ink-dark);
  --dsw-alias-brand-primary: var(--dsw-appearance-bubble-ink-dark);
  --dsw-alias-label-primary-inverted: var(--dsw-appearance-bubble-ink-fg-dark);
  --dsw-alias-label-primary-foreground: var(--dsw-appearance-bubble-ink-fg-dark);
}
:is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-bubble-ink-dark] #root [class*="_bubble"] a,
:is(html[data-ds-dark-theme], html[data-theme="dark"]) body[data-dsw-bubble-ink-dark] #root [class*="bubble" i] a,
:is(body[data-dsw-bubble-ink-dark], html[data-ds-dark-theme] body[data-dsw-bubble-ink-dark], html[data-theme="dark"] body[data-dsw-bubble-ink-dark]) #root [class*="bubble" i] a {
  color: inherit;
  text-decoration: underline;
}
/* Solid tags legibility (Issue: Agent Presets "新任务默认"):
   DSH's stock Tag component pairs background: var(--dsw-alias-label-primary)
   with color: var(--dsw-alias-bg-layer-3). Because bg-layer-3 is a surface
   token that becomes translucent when surfaceAlpha < 1 (and completely
   transparent at surfaceAlpha: 0), the text in solid tags becomes invisible
   against the opaque label-primary pill. Enforce the high-contrast inverted
   label ink on all solid tags. */
:is(#root, body) [data-tone='solid'] {
  color: var(--dsw-alias-label-primary-inverted) !important;
}
/* Deliverables & changed-files cards (translucency support):
   DSH hardcodes --changes-fill / --deliverable-fill to static opaque neutrals
   (--dsw-static-neutral-50/850), making the "已修改 X 个文件" header and file
   chips remain opaque blocks when translucent panels are active.
   Remap them to alias module/hover tokens so they follow surfaceAlpha. */
:is(html, body) :is([class*="card" i], [class*="root" i], [class*="file" i], [class*="header" i], [class*="deliverable" i], [class*="changes" i]),
:is(html, body) [class*="kuvljq"],
:is(html, body) [class*="flL80G"] {
  --changes-fill: var(--dsw-alias-bg-module-platform) !important;
  --changes-hover: var(--dsw-alias-interactive-bg-hover-solid) !important;
  --deliverable-fill: var(--dsw-alias-bg-module-platform) !important;
  --deliverable-hover: var(--dsw-alias-interactive-bg-hover-solid) !important;
}
/* Menu & popover surfaces (MenuSurface, slash command menu, jobs panel, permission presets, avatar menu):
   DSH MenuSurface sets background: var(--dsw-menu-surface-fill) and
   backdrop-filter: var(--dsw-menu-backdrop-filter). Guarantee that menu surfaces
   always evaluate to the user's translucent menu tokens and follow glassBlur,
   and clear the macOS opaque ._backing layer so chat/wallpaper shows through. */
[data-menu-material],
:is(#root, body) [data-menu-material],
:is(#root, body) [class*="menu" i] {
  --dsw-menu-surface-fill: var(--dsw-specific-menu) !important;
  --dsw-alias-menu-group-header-fill: transparent !important;
}
:where(#root, body) [data-menu-material] > [class*="_backing"] {
  background: transparent !important;
}
/* Modals & Settings Dialog (Issue #37: independent modalAlpha):
   Settings panel (.wCInkW_panel / [data-shortcut-modal="settings"]) and native
   modals (Modal.module.css .dialog / [role="dialog"]) use --dsw-alias-bg-layer-2.
   When surfaceAlpha is 0%, baking bg-layer-2 globally turns the settings dialog
   100% transparent and unreadable over wallpaper and chat text.
   Scope modal layer tokens and active navigation tabs to modalAlpha values.
   Excludes backdrop masks / overlays (.overlay, .mask) so the dimming mask stays untouched. */
/* Keep ancestor scoping specificity-free: :is(#root, body) contributes an
   ID even for body-level portals, preventing the dark-mode rule below from
   overriding the light modal background and tokens.
   Only match modal/dialog root containers (never broad panel/dialog substring
   selectors, which would match inner child elements like .schemePanel or
   .dialogBody and double-paint translucent backgrounds). */
:where(#root, body) :is(
  [role="dialog"],
  [aria-modal="true"],
  [data-shortcut-modal="settings"],
  [class$="_dialog"],
  [class*="_dialog "]
):not([class*="overlay" i]):not([class*="mask" i]) {
  --dsw-alias-bg-layer-1: var(--dsw-appearance-modal-l1-light);
  --dsw-alias-bg-layer-2: var(--dsw-appearance-modal-l2-light);
  --dsw-alias-bg-layer-3: var(--dsw-appearance-modal-l3-light);
  --dsw-alias-bg-overlay: var(--dsw-appearance-modal-overlay-light);
  --dsw-alias-bg-module-platform: var(--dsw-appearance-modal-mod-light);
  --dsw-specific-sidebar-nav-item-active: var(--dsw-appearance-modal-nav-active-light);
  --dsw-specific-sidebar-nav-item-hover: var(--dsw-appearance-modal-nav-hover-light);
  background: var(--dsw-appearance-modal-l2-light) !important;
  backdrop-filter: var(--dsw-appearance-glass-filter, none);
  -webkit-backdrop-filter: var(--dsw-appearance-glass-filter, none);
}
:is(html[data-ds-dark-theme], html[data-theme="dark"], body[data-ds-dark-theme], body[data-theme="dark"]) :is(
  [role="dialog"],
  [aria-modal="true"],
  [data-shortcut-modal="settings"],
  [class$="_dialog"],
  [class*="_dialog "]
):not([class*="overlay" i]):not([class*="mask" i]) {
  --dsw-alias-bg-layer-1: var(--dsw-appearance-modal-l1-dark);
  --dsw-alias-bg-layer-2: var(--dsw-appearance-modal-l2-dark);
  --dsw-alias-bg-layer-3: var(--dsw-appearance-modal-l3-dark);
  --dsw-alias-bg-overlay: var(--dsw-appearance-modal-overlay-dark);
  --dsw-alias-bg-module-platform: var(--dsw-appearance-modal-mod-dark);
  --dsw-specific-sidebar-nav-item-active: var(--dsw-appearance-modal-nav-active-dark);
  --dsw-specific-sidebar-nav-item-hover: var(--dsw-appearance-modal-nav-hover-dark);
  background: var(--dsw-appearance-modal-l2-dark) !important;
}
/* Sidebar session row & navigation active/hover states + localized frosted glass:
   DSH styles .hIlkoa_sessionRow.hIlkoa_selected and ._2H3hWW_panelRow._2H3hWW_panelActive
   with "background: var(--dsw-alias-interactive-bg-hover)".
   In the sidebar column (.BynINW_sidebarCol / [class*="sidebarCol" i]), map
   --dsw-alias-interactive-bg-hover to --dsw-specific-sidebar-nav-item-active for selected
   items, and --dsw-specific-sidebar-nav-item-hover for hover states.
   For glassBlur, apply backdrop-filter on sidebarCol::before (never on sidebarCol or
   SidebarRoot directly, which would create a fixed-position containing block and trap
   Windows desktop titlebar toggle buttons) and punch out SidebarRoot's duplicate
   sidebar-fill background so sidebarAlpha stays single-layer. */
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) {
  position: relative;
  --dsw-alias-interactive-bg-hover: var(--dsw-specific-sidebar-nav-item-active);
}
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i])::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  backdrop-filter: var(--dsw-appearance-glass-filter, none);
  -webkit-backdrop-filter: var(--dsw-appearance-glass-filter, none);
}
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) > :not([data-slot]),
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) > [data-slot] > * {
  position: relative;
  background: transparent !important;
}
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) > :not([data-slot]) > *,
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) > [data-slot] > * > * {
  position: relative;
}
:is(#root, body) :is([class*="_sidebarCol"], [class*="sidebarCol" i]) :is([class*="_sessionRow"], [class*="sessionRow" i], [class*="_panelRow"], [class*="panelRow" i], button):hover:not(:is([class*="_selected"], [class*="selected" i], [class*="_panelActive"], [class*="panelActive" i])) {
  --dsw-alias-interactive-bg-hover: var(--dsw-specific-sidebar-nav-item-hover);
}
/* Component-level frosted glass (composer input card, attachment cards, user bubbles,
   and code blocks): glassBlur frosts only UI surfaces and never the background layer.
   IMPORTANT: The composer card ([data-composer-card] / [class*="_card"]:has([class*="_input"]))
   hosts [data-composer-overlay] (slash command menu [data-trigger-menu] and command popup)
   positioned at "bottom: calc(100% + 4px)" outside the card's box. Applying backdrop-filter
   directly on the card makes it a CSS Backdrop Root and clips the slash menu's backdrop-filter
   to 0px. Frost the card via ::before instead so [data-composer-overlay] is never clipped. */
:where(#root, body) :is([data-composer-card], [class*="_card"]:has([class*="_input"])) {
  position: relative;
}
:where(#root, body) :is([data-composer-card], [class*="_card"]:has([class*="_input"]))::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  backdrop-filter: var(--dsw-appearance-glass-filter, none);
  -webkit-backdrop-filter: var(--dsw-appearance-glass-filter, none);
}
:where(#root, body) :is([data-composer-card], [class*="_card"]:has([class*="_input"])) > :not([data-composer-overlay]):not([data-slot]),
:where(#root, body) :is([data-composer-card], [class*="_card"]:has([class*="_input"])) > [data-slot] > * {
  position: relative;
  z-index: 1;
}
:where(#root, body) :is([data-composer-card], [class*="_card"]:has([class*="_input"])) > [data-composer-overlay] {
  z-index: 2;
}
:where(#root, body) :is(
  [class*="_fileCard"],
  [class*="_bubble"],
  [data-code-block]
) {
  backdrop-filter: var(--dsw-appearance-glass-filter, none);
  -webkit-backdrop-filter: var(--dsw-appearance-glass-filter, none);
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
    // Windows desktop host frame punch-out (Issue #31):
    // DSH 0.2.0 desktop on Windows sets `[data-windows-titlebar] .BynINW_frame { background: var(--dsw-specific-sidebar-fill) }`
    // which encloses the entire viewport with opaque sidebar color, blocking the wallpaper on the main canvas.
    // Setting `data-dsw-has-bg` on <html> triggers the transparent frame rule when wallpaper/video is active,
    // aligning Windows desktop behavior with Web and macOS.
    const hasMedia = value.backgroundImage !== '' || value.backgroundVideo !== ''
    if (hasMedia) {
      document.documentElement.setAttribute('data-dsw-has-bg', '')
    } else {
      document.documentElement.removeAttribute('data-dsw-has-bg')
    }
    // The wallpaper rides a CSS variable like every other knob; the value is
    // a record key (or legacy inline data URL) and resolves asynchronously.
    void this.syncImage(value.backgroundImage)
    body.style.setProperty('--dsw-appearance-bg-opacity', String(value.backgroundOpacity))
    const resolveRole = (role: 'background' | 'panel'): { light: string; dark: string } => {
      const l = value.light?.[role] || ''
      const d = value.dark?.[role] || ''
      const hasPerModeConfig = l !== '' || d !== ''
      const legacy = !hasPerModeConfig ? (value[role] || '') : ''
      return {
        light: l !== '' ? l : legacy,
        dark: d !== '' ? d : legacy,
      }
    }
    const resolvedBg = resolveRole('background')
    const defaultLightBase = value.imageDark ? '#151517' : '#ffffff'
    const bgLight = resolvedBg.light || defaultLightBase
    const bgDark = resolvedBg.dark || '#151517'
    body.style.setProperty('--dsw-appearance-bg-base-light', bgLight)
    body.style.setProperty('--dsw-appearance-bg-base-dark', bgDark)
    // 背景模糊 exclusively drives the wallpaper/video layer (#dsw-appearance-bg).
    // 毛玻璃 (glassBlur) is strictly decoupled so it frosts only UI components
    // (sidebar, input box, settings/modals, menus, bubbles) without blurring the
    // exposed background canvas.
    body.style.setProperty(
      '--dsw-appearance-blur',
      `${value.backgroundBlur}px`,
    )
    const glassFilter = value.glassBlur > 0 ? `blur(${value.glassBlur}px) saturate(150%)` : 'none'
    body.style.setProperty('--dsw-appearance-glass-filter', glassFilter)
    // Drive the modal backdrop mask (.VOzbGW_mask) with glassBlur while modals
    // are open; closing the modal unmounts the mask and leaves the background
    // layer strictly controlled by backgroundBlur.
    body.style.setProperty('--dsw-mask-blur', `blur(${value.glassBlur}px)`)
    body.style.setProperty('--dsw-menu-backdrop-filter', glassFilter)
    body.style.setProperty('--dsw-appearance-scrim', String(value.scrim))

    // Modals & Settings Dialog (Issue #37: independent modalAlpha):
    const modalAlpha = typeof value.modalAlpha === 'number' ? value.modalAlpha : 1
    const resolvedPanel = resolveRole('panel')
    const panelLight = resolvedPanel.light
    const panelDark = resolvedPanel.dark

    const isFlip = (value.backgroundImage !== '' || value.backgroundVideo !== '') && value.imageDark

    const baseL1Light = panelLight !== '' ? panelLight : (isFlip ? '#242426' : '#ffffff')
    const baseL2Light = panelLight !== '' ? mixHex(panelLight, '#ffffff', 0.08) : (isFlip ? '#343437' : '#ffffff')
    const baseL3Light = panelLight !== '' ? mixHex(panelLight, '#ffffff', 0.14) : (isFlip ? '#434347' : '#ffffff')
    const baseOvLight = panelLight !== '' ? mixHex(panelLight, '#ffffff', 0.1) : (isFlip ? '#6e6e73' : '#e9ecf2')
    const baseModLight = panelLight !== '' ? mixHex(panelLight, '#ffffff', 0.06) : (isFlip ? '#434347' : '#f5f6f7')
    const baseNavActiveLight = panelLight !== '' ? mixHex(panelLight, '#151517', 0.10) : (isFlip ? 'rgb(67, 69, 74)' : '#ebeef2')
    const baseNavHoverLight = panelLight !== '' ? mixHex(panelLight, '#151517', 0.05) : (isFlip ? 'rgb(53, 54, 56)' : '#f1f3f5')

    const baseL1Dark = panelDark !== '' ? panelDark : '#232324'
    const baseL2Dark = panelDark !== '' ? mixHex(panelDark, '#151517', 0.08) : '#2c2c2e'
    const baseL3Dark = panelDark !== '' ? mixHex(panelDark, '#151517', 0.14) : '#353638'
    const baseOvDark = panelDark !== '' ? mixHex(panelDark, '#151517', 0.1) : '#61666b'
    const baseModDark = panelDark !== '' ? mixHex(panelDark, '#151517', 0.06) : '#353638'
    const baseNavActiveDark = panelDark !== '' ? mixHex(panelDark, '#ffffff', 0.10) : '#43454a'
    const baseNavHoverDark = panelDark !== '' ? mixHex(panelDark, '#ffffff', 0.05) : '#2c2c2e'

    const bakeModal = (hexOrRgb: string, alpha: number): string => {
      if (alpha >= 1) return hexOrRgb
      return withAlpha(hexOrRgb, alpha)
    }

    body.style.setProperty('--dsw-appearance-modal-l1-light', bakeModal(baseL1Light, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-l1-dark', bakeModal(baseL1Dark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-l2-light', bakeModal(baseL2Light, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-l2-dark', bakeModal(baseL2Dark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-l3-light', bakeModal(baseL3Light, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-l3-dark', bakeModal(baseL3Dark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-overlay-light', bakeModal(baseOvLight, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-overlay-dark', bakeModal(baseOvDark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-mod-light', bakeModal(baseModLight, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-mod-dark', bakeModal(baseModDark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-nav-active-light', bakeModal(baseNavActiveLight, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-nav-active-dark', bakeModal(baseNavActiveDark, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-nav-hover-light', bakeModal(baseNavHoverLight, modalAlpha))
    body.style.setProperty('--dsw-appearance-modal-nav-hover-dark', bakeModal(baseNavHoverDark, modalAlpha))

    // Text selection contrast (Issue #46): write dedicated global and bubble
    // selection pairs per mode so bubble-scoped brand overrides never cause
    // white-on-white or black-on-black `::selection` highlights.
    const sel = selectionColors(value)
    body.style.setProperty('--dsw-appearance-selection-bg-light', sel.global.light.bg)
    body.style.setProperty('--dsw-appearance-selection-fg-light', sel.global.light.fg)
    body.style.setProperty('--dsw-appearance-selection-bg-dark', sel.global.dark.bg)
    body.style.setProperty('--dsw-appearance-selection-fg-dark', sel.global.dark.fg)
    body.style.setProperty('--dsw-appearance-bubble-selection-bg-light', sel.bubble.light.bg)
    body.style.setProperty('--dsw-appearance-bubble-selection-fg-light', sel.bubble.light.fg)
    body.style.setProperty('--dsw-appearance-bubble-selection-bg-dark', sel.bubble.dark.bg)
    body.style.setProperty('--dsw-appearance-bubble-selection-fg-dark', sel.bubble.dark.fg)

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
   * property with the color (and its contrasting foreground counterpart)
   * and a gate attribute that arms the scoped stylesheet rule.
   * @param mode - theme mode the ink is computed for.
   * @param hex - contrast ink color, or null to retract the override.
   */
  private applyBubbleInk(mode: 'light' | 'dark', hex: string | null): void {
    const body = document.body
    const attr = `data-dsw-bubble-ink-${mode}`
    const variable = `--dsw-appearance-bubble-ink-${mode}`
    const fgVariable = `--dsw-appearance-bubble-ink-fg-${mode}`
    if (hex === null) {
      body.removeAttribute(attr)
      body.style.removeProperty(variable)
      body.style.removeProperty(fgVariable)
    } else {
      body.setAttribute(attr, '')
      body.style.setProperty(variable, hex)
      body.style.setProperty(fgVariable, onInk(hex))
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
    if (key === '') {
      this.videoKey = ''
      this.teardownVideo()
      this.layer.removeAttribute('data-video')
      this.reportVideoError(false)
      return
    }
    if (key === this.videoKey) return
    this.videoKey = key
    this.teardownVideo()
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
    body.style.removeProperty('--dsw-menu-backdrop-filter')
    body.removeAttribute('data-dsw-bubble-ink-light')
    body.removeAttribute('data-dsw-bubble-ink-dark')
    body.removeAttribute('data-dsw-sliding')
    // Compositor anchor cleanup: remove the html attribute so the host's natural
    // background resumes after the plugin is unloaded.
    document.documentElement.removeAttribute('data-dsw-has-bg')
  }
}
