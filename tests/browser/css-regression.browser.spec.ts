// @vitest-environment jsdom
/**
 * Real headless Chromium CSS cascade & WCAG contrast regression suite.
 * Captures the exact tokens, <style>, attributes, and CSS custom properties
 * emitted by AppearanceApplier, projects them onto a faithful DSH host DOM
 * inside real Chromium, and asserts getComputedStyle + contrast results that
 * jsdom cannot compute.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_DARK_THEME, DEFAULT_SETTINGS, type AppearanceSettings } from '../../src/appearance-settings.ts'
import { AppearanceApplier, BG_LAYER_ID, STYLE_ID } from '../../src/client/applier.ts'

const STOCK_HOST_CSS = `
:root {
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #ffffff;
  --dsw-alias-bg-layer-3: #ffffff;
  --dsw-alias-label-primary: #0f1115;
  --dsw-alias-label-primary-inverted: #fafaf9;
  --dsw-alias-label-primary-foreground: #fafaf9;
  --dsw-alias-brand-primary: #0f1115;
  --dsw-alias-state-business-primary: #4176e6;
  --dsw-alias-button-primary-fill: var(--dsw-alias-brand-primary);
  --dsw-alias-button-info-fill: #4176e6;
  --dsw-specific-sidebar-fill: #f9fafb;
  --dsw-specific-sidebar-nav-item-active-accent: #edf3fe;
  --dsw-specific-bubble: #edf3fe;
  --dsw-specific-input-major: #ffffff;
  --dsw-alias-tooltip-bg: #151517;
  --dsw-alias-tooltip-label: #fafaf9;
}
html[data-ds-dark-theme] {
  --dsw-alias-bg-base: #151517;
  --dsw-alias-bg-layer-1: #232324;
  --dsw-alias-bg-layer-2: #2c2c2e;
  --dsw-alias-bg-layer-3: #353638;
  --dsw-alias-label-primary: #fafaf9;
  --dsw-alias-label-primary-inverted: #0f1115;
  --dsw-alias-label-primary-foreground: #0f1115;
  --dsw-alias-brand-primary: #f9fafb;
  --dsw-alias-state-business-primary: #7aaaff;
  --dsw-alias-button-primary-fill: var(--dsw-alias-brand-primary);
  --dsw-alias-button-info-fill: #7aaaff;
  --dsw-specific-sidebar-fill: #1b1b1c;
  --dsw-specific-sidebar-nav-item-active-accent: #2c2c2e;
  --dsw-specific-bubble: #2c2c2e;
  --dsw-specific-input-major: #2c2c2e;
}
.qc_checkboxChecked {
  background-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.qc_badge {
  background-color: var(--dsw-specific-sidebar-nav-item-active-accent);
  color: var(--dsw-alias-button-info-fill);
}
button[class*="_primary"] {
  background-color: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
button[class*="_info"] {
  background-color: var(--dsw-alias-button-info-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
[data-composer-card] {
  background-color: var(--dsw-specific-input-major);
  border-radius: 12px;
}
.shell_sidebarCol {
  background-color: var(--dsw-specific-sidebar-fill);
}
.sb_root {
  background-color: var(--dsw-specific-sidebar-fill);
}
[role="dialog"] {
  background-color: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.chat_bubble {
  background-color: var(--dsw-specific-bubble);
  color: var(--dsw-alias-label-primary);
}
.tip_bubble[data-side] {
  background-color: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-alias-tooltip-label);
}
[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open] {
  background-color: rgb(from var(--dsw-alias-bg-base) r g b / 1) !important;
}
`

const FIXTURE_HTML = `<!doctype html>
<html>
  <body>
    <div id="root">
      <div class="shell_frame" data-rightbar-fullscreen>
        <div class="shell_sidebarCol">
          <div data-slot="sidebar">
            <div class="sb_root">Sidebar</div>
          </div>
        </div>
        <div class="shell_centerCol">
          <div class="qc_option">
            <span class="qc_checkboxChecked">✓</span>
            <span class="qc_badge">推荐</span>
          </div>
          <button type="button" class="btn_primary global_primary">确定</button>
          <button type="button" class="btn_info global_info">信息</button>
          <div class="chat_bubble">User message</div>
          <div data-composer-card class="cc_card">
            <div data-composer-overlay class="cc_overlay">Slash</div>
            <textarea class="cc_input"></textarea>
            <button type="button" class="btn_primary composer_primary">发送</button>
            <button type="button" class="btn_info composer_info">继续</button>
          </div>
        </div>
        <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open class="rb_fullscreen">Rightbar</div>
      </div>
      <div role="dialog" aria-modal="true" class="modal_dialog">Settings Modal</div>
    </div>
    <div class="tip_bubble" data-side="top" data-portal="">Tooltip</div>
  </body>
</html>`

interface CapturedApplierOutput {
  overrides: ThemeTokenOverrides
  stylesheet: string
  htmlAttrs: Record<string, string>
  bodyAttrs: Record<string, string>
  bodyVars: Record<string, string>
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

function full(partial: Partial<AppearanceSettings> = {}): AppearanceSettings {
  return { ...DEFAULT_SETTINGS, ...partial }
}

function captureApplier(settings: AppearanceSettings): CapturedApplierOutput {
  let overrides: ThemeTokenOverrides = {}
  const ctx = {
    theme: {
      overrideTokens: (_source: string, next: ThemeTokenOverrides) => {
        overrides = next
        return () => {}
      },
    },
  } as unknown as ClientContext

  const applier = new AppearanceApplier(ctx)
  try {
    applier.apply(settings)
    const stylesheet = document.getElementById(STYLE_ID)?.textContent ?? ''

    const htmlAttrs: Record<string, string> = {}
    for (const attr of document.documentElement.attributes) {
      if (attr.name.startsWith('data-dsw-')) htmlAttrs[attr.name] = attr.value
    }

    const bodyAttrs: Record<string, string> = {}
    for (const attr of document.body.attributes) {
      if (attr.name.startsWith('data-dsw-')) bodyAttrs[attr.name] = attr.value
    }

    const bodyVars: Record<string, string> = {}
    const { style } = document.body
    for (let i = 0; i < style.length; i += 1) {
      const name = style.item(i)
      if (name.startsWith('--dsw-')) {
        bodyVars[name] = style.getPropertyValue(name).trim()
      }
    }

    return { overrides, stylesheet, htmlAttrs, bodyAttrs, bodyVars }
  } finally {
    applier.dispose()
    document.head.querySelectorAll(`#${STYLE_ID}`).forEach(node => { node.remove() })
    document.body.querySelectorAll(`#${BG_LAYER_ID}`).forEach(node => { node.remove() })
  }
}

function buildOverridesCss(overrides: ThemeTokenOverrides): string {
  const lightDecls: string[] = []
  const darkDecls: string[] = []
  for (const [token, pair] of Object.entries(overrides)) {
    if (pair.light) lightDecls.push(`  ${token}: ${pair.light};`)
    if (pair.dark) darkDecls.push(`  ${token}: ${pair.dark};`)
  }
  return `:root {\n${lightDecls.join('\n')}\n}\nhtml[data-ds-dark-theme] {\n${darkDecls.join('\n')}\n}`
}

function parseRgba(cssColor: string): RgbaColor {
  const match = cssColor.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!match) throw new Error(`Expected rgb/rgba color, got: ${cssColor}`)
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
}

function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const alpha = fg.a
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  }
}

function luminance(color: RgbaColor): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

function wcagContrast(a: RgbaColor, b: RgbaColor): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

async function renderFixture(page: Page, settings: AppearanceSettings, mode: 'light' | 'dark'): Promise<void> {
  const captured = captureApplier(settings)
  await page.setContent(FIXTURE_HTML)
  await page.addStyleTag({ content: STOCK_HOST_CSS })
  await page.addStyleTag({ content: buildOverridesCss(captured.overrides) })
  await page.evaluate(
    ({ payload, themeMode, styleId, bgId }) => {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = payload.stylesheet
      document.head.append(style)

      const bg = document.createElement('div')
      bg.id = bgId
      document.body.prepend(bg)

      if (themeMode === 'dark') {
        document.documentElement.setAttribute('data-ds-dark-theme', '')
      }
      for (const [k, v] of Object.entries(payload.htmlAttrs)) {
        document.documentElement.setAttribute(k, v)
      }
      for (const [k, v] of Object.entries(payload.bodyAttrs)) {
        document.body.setAttribute(k, v)
      }
      for (const [k, v] of Object.entries(payload.bodyVars)) {
        document.body.style.setProperty(k, v)
      }
    },
    { payload: captured, themeMode: mode, styleId: STYLE_ID, bgId: BG_LAYER_ID },
  )
}

async function readStyles(page: Page, selector: string, pseudo?: string) {
  return page.evaluate(
    ({ sel, ps }) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`Missing element: ${sel}`)
      const cs = window.getComputedStyle(el, ps)
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        opacity: cs.opacity,
        visibility: cs.visibility,
        pointerEvents: cs.pointerEvents,
        backdropFilter: cs.backdropFilter,
      }
    },
    { sel: selector, ps: pseudo },
  )
}

describe('Chromium CSS & contrast regressions', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
  })

  afterAll(async () => {
    await page?.close()
    await browser?.close()
  })

  it('1. default dark theme keeps QuestionComposer checked checkbox high contrast (>= 7:1)', async () => {
    await renderFixture(page, full(), 'dark')
    const styles = await readStyles(page, '.qc_checkboxChecked')
    const fg = parseRgba(styles.color)
    const bg = parseRgba(styles.backgroundColor)
    expect(bg).toEqual({ r: 250, g: 250, b: 249, a: 1 })
    expect(fg).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(wcagContrast(fg, bg)).toBeGreaterThanOrEqual(7)
  })

  it('2. inputAlpha 0 keeps QuestionComposer 推荐 badge opaque (>= 4.5:1) while making composer send button transparent', async () => {
    await renderFixture(page, full({ inputAlpha: 0 }), 'dark')
    const badge = await readStyles(page, '.qc_badge')
    const composerSend = await readStyles(page, '.composer_primary')
    const badgeFg = parseRgba(badge.color)
    const badgeBg = parseRgba(badge.backgroundColor)
    expect(badgeFg.a).toBe(1)
    expect(wcagContrast(badgeFg, badgeBg)).toBeGreaterThanOrEqual(4.5)
    expect(parseRgba(composerSend.backgroundColor).a).toBe(0)
  })

  it('3. light mode + dark wallpaper (imageDark) + inputAlpha 0.5 flips primary & composer buttons to light fill with dark ink (>= 4.5:1)', async () => {
    await renderFixture(
      page,
      full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true, inputAlpha: 0.5 }),
      'light',
    )
    const globalPrimary = await readStyles(page, '.global_primary')
    const composerSend = await readStyles(page, '.composer_primary')
    const backdrop = { r: 21, g: 21, b: 23, a: 1 }

    const globalBg = parseRgba(globalPrimary.backgroundColor)
    const globalFg = parseRgba(globalPrimary.color)
    expect(globalBg).toEqual({ r: 249, g: 250, b: 251, a: 1 })
    expect(globalFg).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(wcagContrast(globalFg, globalBg)).toBeGreaterThanOrEqual(7)

    const sendBg = parseRgba(composerSend.backgroundColor)
    const sendFg = parseRgba(composerSend.color)
    expect(sendBg).toEqual({ r: 249, g: 250, b: 251, a: 0.5 })
    expect(wcagContrast(sendFg, compositeOver(sendBg, backdrop))).toBeGreaterThanOrEqual(4.5)
  })

  it('4. custom bright accent (#f5e050) in dark mode scopes dark ink to primary & info buttons without breaking neutral checkboxes', async () => {
    await renderFixture(page, full({ dark: { ...DEFAULT_DARK_THEME, accent: '#f5e050' } }), 'dark')
    const globalPrimary = await readStyles(page, '.global_primary')
    const globalInfo = await readStyles(page, '.global_info')
    const checkbox = await readStyles(page, '.qc_checkboxChecked')

    expect(parseRgba(globalPrimary.color)).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(parseRgba(globalInfo.color)).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(wcagContrast(parseRgba(globalPrimary.color), parseRgba(globalPrimary.backgroundColor))).toBeGreaterThanOrEqual(7)
    expect(wcagContrast(parseRgba(globalInfo.color), parseRgba(globalInfo.backgroundColor))).toBeGreaterThanOrEqual(7)
    expect(wcagContrast(parseRgba(checkbox.color), parseRgba(checkbox.backgroundColor))).toBeGreaterThanOrEqual(7)
  })

  it('5. dark mode modal dialog stays dark under translucent panels (Issue #38)', async () => {
    await renderFixture(page, full({ surfaceAlpha: 0.4, modalAlpha: 0.85 }), 'dark')
    const modal = await readStyles(page, '[role="dialog"]')
    const backdrop = { r: 21, g: 21, b: 23, a: 1 }
    const effective = compositeOver(parseRgba(modal.backgroundColor), backdrop)
    expect(luminance(effective)).toBeLessThan(0.25)
  })

  it('6. fullscreen right sidebar with wallpaper overrides dsh-skins opaque black and hides occluded center column (Issue #53)', async () => {
    await renderFixture(page, full({ backgroundImage: 'data:image/webp;base64,AAAA', surfaceAlpha: 0.5 }), 'dark')
    const rightbar = await readStyles(page, '[data-sidebar-right-panel="fullscreen"]')
    const center = await readStyles(page, '.shell_centerCol')
    expect(parseRgba(rightbar.backgroundColor)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(center.opacity).toBe('0')
    expect(center.visibility).toBe('hidden')
    expect(center.pointerEvents).toBe('none')
  })

  it('7. frosted glass (glassBlur: 12) keeps composer card and sidebar Backdrop-Root free while applying blur on ::before', async () => {
    await renderFixture(page, full({ glassBlur: 12 }), 'dark')
    const card = await readStyles(page, '[data-composer-card]')
    const cardBefore = await readStyles(page, '[data-composer-card]', '::before')
    const sidebar = await readStyles(page, '.shell_sidebarCol')
    const sidebarBefore = await readStyles(page, '.shell_sidebarCol', '::before')

    expect(card.backdropFilter).toBe('none')
    expect(sidebar.backdropFilter).toBe('none')
    expect(cardBefore.backdropFilter).toContain('blur(12px)')
    expect(sidebarBefore.backdropFilter).toContain('blur(12px)')
  })

  it('8. low-contrast user bubble triggers bubbleInk fallback (>= 7:1) without altering stock tooltip colors', async () => {
    await renderFixture(page, full({ panel: '#101010' }), 'light')
    const bubble = await readStyles(page, '.chat_bubble')
    const tooltip = await readStyles(page, '.tip_bubble[data-side]')

    const bubbleFg = parseRgba(bubble.color)
    const bubbleBg = parseRgba(bubble.backgroundColor)
    expect(wcagContrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(7)

    expect(parseRgba(tooltip.backgroundColor)).toEqual({ r: 21, g: 21, b: 23, a: 1 })
    expect(parseRgba(tooltip.color)).toEqual({ r: 250, g: 250, b: 249, a: 1 })
  })
})
