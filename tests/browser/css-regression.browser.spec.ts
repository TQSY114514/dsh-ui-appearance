/**
 * Real headless Chromium CSS cascade & WCAG contrast regression suite.
 * Bundles `src/client/applier.ts` in memory with Rolldown and executes the
 * real `AppearanceApplier` directly inside Chromium against a faithful DSH
 * host DOM, asserting computed styles, WCAG contrast, and clean `dispose()`.
 */
import { chromium, type Browser, type Page } from 'playwright-core'
// Relies on tsdown re-exporting its bundled `rolldown` dependency so no extra devDependency is needed.
import { Rolldown } from 'tsdown'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_DARK_THEME, DEFAULT_SETTINGS, type AppearanceSettings } from '../../src/appearance-settings.ts'
import { BG_LAYER_ID, STYLE_ID } from '../../src/client/applier.ts'
import { contrastRatio, formatHex, relativeLuminance } from '../../src/client/color.ts'

const HOST_OVERRIDES_STYLE_ID = 'dsh-host-overrides'

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
  --dsw-static-neutral-bluish-75: #f2f4f7;
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
body:not([data-ds-dark-theme]) {
  --lc-canvas: var(--dsw-static-neutral-bluish-75);
  --lc-control-track: var(--dsw-static-neutral-bluish-75);
}
.lc-root {
  background: var(--lc-canvas, transparent);
}
.lc-card {
  background: var(--dsw-alias-bg-layer-1);
}
.lc-gran {
  background: var(--lc-control-track);
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
          <div class="lc-root">
            <div class="lc-gran">步骤</div>
            <div class="lc-card">Context</div>
          </div>
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

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

interface ApplierInstance {
  apply(settings: AppearanceSettings): void
  dispose(): void
}

interface TestWindow extends Window {
  __AppearanceApplierBundle__?: {
    AppearanceApplier: new (ctx: unknown) => ApplierInstance
  }
  __activeApplier__?: ApplierInstance
}

function full(partial: Partial<AppearanceSettings> = {}): AppearanceSettings {
  return { ...DEFAULT_SETTINGS, ...partial }
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

function toHex(color: RgbaColor): string {
  return formatHex({
    r: Math.round(color.r),
    g: Math.round(color.g),
    b: Math.round(color.b),
  })
}

const applierUrl = new URL('../../src/client/applier.ts', import.meta.url)
const decodedApplierPath = decodeURIComponent(applierUrl.pathname)
const APPLIER_ENTRY = /^\/[A-Za-z]:\//.test(decodedApplierPath) ? decodedApplierPath.slice(1) : decodedApplierPath

async function bundleApplierForBrowser(): Promise<string> {
  const bundle = await Rolldown.rolldown({
    input: APPLIER_ENTRY,
    platform: 'browser',
  })
  try {
    const out = await bundle.generate({
      format: 'iife',
      name: '__AppearanceApplierBundle__',
    })
    const chunk = out.output.find((entry) => entry.type === 'chunk')
    if (chunk === undefined || chunk.type !== 'chunk') {
      throw new Error('Rolldown produced no output chunk for src/client/applier.ts')
    }
    return chunk.code
  } finally {
    await bundle.close()
  }
}

async function renderFixture(
  page: Page,
  applierBundleCode: string,
  settings: AppearanceSettings,
  mode: 'light' | 'dark',
): Promise<void> {
  await page.setContent(FIXTURE_HTML)
  await page.addStyleTag({ content: STOCK_HOST_CSS })
  await page.addScriptTag({ content: applierBundleCode })
  await page.evaluate(
    ({ nextSettings, themeMode, hostOverridesId }) => {
      if (themeMode === 'dark') {
        document.documentElement.setAttribute('data-ds-dark-theme', '')
      }
      let overrideGen = 0
      const hostCtx = {
        theme: {
          overrideTokens(
            _source: string,
            overrides: Record<string, { light: string; dark: string }>,
          ): () => void {
            const gen = ++overrideGen
            const entries = Object.entries(overrides)
            if (entries.length === 0) {
              document.getElementById(hostOverridesId)?.remove()
              return () => {}
            }
            let style = document.getElementById(hostOverridesId) as HTMLStyleElement | null
            if (style === null) {
              style = document.createElement('style')
              style.id = hostOverridesId
              document.head.append(style)
            }
            const lightDecls: string[] = []
            const darkDecls: string[] = []
            for (const [token, pair] of entries) {
              if (pair.light) lightDecls.push(`  ${token}: ${pair.light};`)
              if (pair.dark) darkDecls.push(`  ${token}: ${pair.dark};`)
            }
            style.textContent = `:root {\n${lightDecls.join('\n')}\n}\nhtml[data-ds-dark-theme] {\n${darkDecls.join('\n')}\n}`
            return () => {
              if (overrideGen === gen) {
                document.getElementById(hostOverridesId)?.remove()
              }
            }
          },
        },
      }
      const win = window as unknown as TestWindow
      const Bundle = win.__AppearanceApplierBundle__
      if (!Bundle) throw new Error('Missing __AppearanceApplierBundle__ on window')
      const applier = new Bundle.AppearanceApplier(hostCtx)
      applier.apply(nextSettings)
      win.__activeApplier__ = applier
    },
    { nextSettings: settings, themeMode: mode, hostOverridesId: HOST_OVERRIDES_STYLE_ID },
  )
  await page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()) }))
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
  let applierBundleCode: string
  const pageErrors: string[] = []

  beforeAll(async () => {
    applierBundleCode = await bundleApplierForBrowser()
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
    page.on('pageerror', (err) => { pageErrors.push(err.message) })
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text())
    })
  })

  afterEach(() => {
    try {
      expect(pageErrors).toEqual([])
    } finally {
      pageErrors.length = 0
    }
  })

  afterAll(async () => {
    await page?.close()
    await browser?.close()
  })

  it('1. default dark theme keeps QuestionComposer checked checkbox high contrast (>= 7:1)', async () => {
    await renderFixture(page, applierBundleCode, full(), 'dark')
    const styles = await readStyles(page, '.qc_checkboxChecked')
    const fg = parseRgba(styles.color)
    const bg = parseRgba(styles.backgroundColor)
    expect(bg).toEqual({ r: 250, g: 250, b: 249, a: 1 })
    expect(fg).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(contrastRatio(toHex(fg), toHex(bg))).toBeGreaterThanOrEqual(7)
  })

  it('2. inputAlpha 0 keeps QuestionComposer 推荐 badge opaque (>= 4.5:1) while making composer send button transparent', async () => {
    await renderFixture(page, applierBundleCode, full({ inputAlpha: 0 }), 'dark')
    const badge = await readStyles(page, '.qc_badge')
    const composerSend = await readStyles(page, '.composer_primary')
    const badgeFg = parseRgba(badge.color)
    const badgeBg = parseRgba(badge.backgroundColor)
    expect(badgeFg.a).toBe(1)
    expect(contrastRatio(toHex(badgeFg), toHex(badgeBg))).toBeGreaterThanOrEqual(4.5)
    expect(parseRgba(composerSend.backgroundColor).a).toBe(0)
  })

  it('3. light mode + dark wallpaper (imageDark) + inputAlpha 0.5 flips primary & composer buttons to light fill with dark ink (>= 4.5:1)', async () => {
    await renderFixture(
      page,
      applierBundleCode,
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
    expect(contrastRatio(toHex(globalFg), toHex(globalBg))).toBeGreaterThanOrEqual(7)

    const sendBg = parseRgba(composerSend.backgroundColor)
    const sendFg = parseRgba(composerSend.color)
    expect(sendBg).toEqual({ r: 249, g: 250, b: 251, a: 0.5 })
    expect(contrastRatio(toHex(sendFg), toHex(compositeOver(sendBg, backdrop)))).toBeGreaterThanOrEqual(4.5)
  })

  it('4. custom bright accent (#f5e050) in dark mode scopes dark ink to primary & info buttons without breaking neutral checkboxes', async () => {
    await renderFixture(page, applierBundleCode, full({ dark: { ...DEFAULT_DARK_THEME, accent: '#f5e050' } }), 'dark')
    const globalPrimary = await readStyles(page, '.global_primary')
    const globalInfo = await readStyles(page, '.global_info')
    const checkbox = await readStyles(page, '.qc_checkboxChecked')

    expect(parseRgba(globalPrimary.color)).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(parseRgba(globalInfo.color)).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(contrastRatio(toHex(parseRgba(globalPrimary.color)), toHex(parseRgba(globalPrimary.backgroundColor)))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(toHex(parseRgba(globalInfo.color)), toHex(parseRgba(globalInfo.backgroundColor)))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(toHex(parseRgba(checkbox.color)), toHex(parseRgba(checkbox.backgroundColor)))).toBeGreaterThanOrEqual(7)
  })

  it('5. dark mode modal dialog stays dark under translucent panels (Issue #38)', async () => {
    await renderFixture(page, applierBundleCode, full({ surfaceAlpha: 0.4, modalAlpha: 0.85 }), 'dark')
    const modal = await readStyles(page, '[role="dialog"]')
    const backdrop = { r: 21, g: 21, b: 23, a: 1 }
    const effective = compositeOver(parseRgba(modal.backgroundColor), backdrop)
    expect(relativeLuminance(toHex(effective))).toBeLessThan(0.25)
  })

  it('6. fullscreen right sidebar with wallpaper overrides dsh-skins opaque black and hides occluded center column (Issue #53)', async () => {
    await renderFixture(
      page,
      applierBundleCode,
      full({ backgroundImage: 'data:image/webp;base64,AAAA', surfaceAlpha: 0.5 }),
      'dark',
    )
    const rightbar = await readStyles(page, '[data-sidebar-right-panel="fullscreen"]')
    const center = await readStyles(page, '.shell_centerCol')
    expect(parseRgba(rightbar.backgroundColor)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(center.opacity).toBe('0')
    expect(center.visibility).toBe('hidden')
    expect(center.pointerEvents).toBe('none')
  })

  it('7. frosted glass (glassBlur: 12) keeps composer card and sidebar Backdrop-Root free while applying blur on ::before', async () => {
    await renderFixture(page, applierBundleCode, full({ glassBlur: 12 }), 'dark')
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
    await renderFixture(page, applierBundleCode, full({ panel: '#101010' }), 'light')
    const bubble = await readStyles(page, '.chat_bubble')
    const tooltip = await readStyles(page, '.tip_bubble[data-side]')

    const bubbleFg = parseRgba(bubble.color)
    const bubbleBg = parseRgba(bubble.backgroundColor)
    expect(contrastRatio(toHex(bubbleFg), toHex(bubbleBg))).toBeGreaterThanOrEqual(7)

    expect(parseRgba(tooltip.backgroundColor)).toEqual({ r: 21, g: 21, b: 23, a: 1 })
    expect(parseRgba(tooltip.color)).toEqual({ r: 250, g: 250, b: 249, a: 1 })
  })

  it('9. dispose() removes all plugin DOM nodes, attributes, inline variables, and restores stock styles', async () => {
    await renderFixture(
      page,
      applierBundleCode,
      full({
        backgroundImage: 'data:image/webp;base64,AAAA',
        surfaceAlpha: 0.5,
        inputAlpha: 0.4,
        glassBlur: 12,
        dark: { ...DEFAULT_DARK_THEME, accent: '#f5e050' },
      }),
      'dark',
    )

    const beforeDispose = await page.evaluate(
      ({ styleId, bgId, hostOverridesId }) => ({
        hasStyle: document.getElementById(styleId) !== null,
        hasBg: document.getElementById(bgId) !== null,
        hasHostOverrides: document.getElementById(hostOverridesId) !== null,
        hasBgAttr: document.documentElement.hasAttribute('data-dsw-has-bg'),
        hasTranslucentAttr: document.documentElement.hasAttribute('data-dsw-translucent-surface'),
      }),
      { styleId: STYLE_ID, bgId: BG_LAYER_ID, hostOverridesId: HOST_OVERRIDES_STYLE_ID },
    )
    expect(beforeDispose).toEqual({
      hasStyle: true,
      hasBg: true,
      hasHostOverrides: true,
      hasBgAttr: true,
      hasTranslucentAttr: true,
    })

    const afterDispose = await page.evaluate(
      ({ styleId, bgId, hostOverridesId }) => {
        const win = window as unknown as TestWindow
        win.__activeApplier__?.dispose()
        const dswAttrs = (el: Element): string[] =>
          Array.from(el.attributes).map((a) => a.name).filter((n) => n.startsWith('data-dsw-'))
        const dswVars: string[] = []
        for (let i = 0; i < document.body.style.length; i += 1) {
          const name = document.body.style.item(i)
          if (name.startsWith('--dsw-')) dswVars.push(name)
        }
        return {
          hasStyle: document.getElementById(styleId) !== null,
          hasBg: document.getElementById(bgId) !== null,
          hasHostOverrides: document.getElementById(hostOverridesId) !== null,
          htmlDswAttrs: dswAttrs(document.documentElement),
          bodyDswAttrs: dswAttrs(document.body),
          bodyDswVars: dswVars,
        }
      },
      { styleId: STYLE_ID, bgId: BG_LAYER_ID, hostOverridesId: HOST_OVERRIDES_STYLE_ID },
    )

    expect(afterDispose).toEqual({
      hasStyle: false,
      hasBg: false,
      hasHostOverrides: false,
      htmlDswAttrs: [],
      bodyDswAttrs: [],
      bodyDswVars: [],
    })

    const globalPrimary = await readStyles(page, '.global_primary')
    const card = await readStyles(page, '[data-composer-card]')
    expect(parseRgba(globalPrimary.backgroundColor)).toEqual({ r: 249, g: 250, b: 251, a: 1 })
    expect(parseRgba(globalPrimary.color)).toEqual({ r: 15, g: 17, b: 21, a: 1 })
    expect(parseRgba(card.backgroundColor)).toEqual({ r: 44, g: 44, b: 46, a: 1 })
  })

  it('10. dsh-context light-mode canvas becomes transparent over wallpaper and translucent under surfaceAlpha while staying stock in opaque mode', async () => {
    // 1. Opaque mode without wallpaper keeps stock dsh-context light canvas (#f2f4f7)
    await renderFixture(page, applierBundleCode, full(), 'light')
    const stockRoot = await readStyles(page, '.lc-root')
    expect(parseRgba(stockRoot.backgroundColor)).toEqual({ r: 242, g: 244, b: 247, a: 1 })

    // 2. Wallpaper + surfaceAlpha 0.5 makes .lc-root transparent and .lc-card translucent
    await renderFixture(
      page,
      applierBundleCode,
      full({ backgroundImage: 'data:image/webp;base64,AAAA', surfaceAlpha: 0.5 }),
      'light',
    )
    const bgRoot = await readStyles(page, '.lc-root')
    const bgCard = await readStyles(page, '.lc-card')
    expect(parseRgba(bgRoot.backgroundColor)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseRgba(bgCard.backgroundColor)).toEqual({ r: 255, g: 255, b: 255, a: 0.5 })

    // 3. No wallpaper + surfaceAlpha 0.4 makes .lc-root follow surfaceAlpha
    await renderFixture(page, applierBundleCode, full({ surfaceAlpha: 0.4 }), 'light')
    const alphaRoot = await readStyles(page, '.lc-root')
    expect(parseRgba(alphaRoot.backgroundColor)).toEqual({ r: 255, g: 255, b: 255, a: 0.4 })

    // 4. Dark wallpaper (imageDark) in light mode keeps .lc-root transparent and flips .lc-gran control track dark
    await renderFixture(
      page,
      applierBundleCode,
      full({ backgroundImage: 'data:image/webp;base64,AAAA', imageDark: true }),
      'light',
    )
    const flippedRoot = await readStyles(page, '.lc-root')
    const flippedTrack = await readStyles(page, '.lc-gran')
    expect(parseRgba(flippedRoot.backgroundColor)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(relativeLuminance(toHex(parseRgba(flippedTrack.backgroundColor)))).toBeLessThan(0.15)
  })
})
