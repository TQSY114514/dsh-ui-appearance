// @vitest-environment jsdom
/** Plugin write path: localStorage persistence, publish fan-out, cross-tab sync. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import { apply, STORAGE_KEY } from '../src/client/index.ts'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { AppearanceCustomizerInjected } from '../src/client/AppearanceCustomizerRow.tsx'

/** Minimal cordis client context: runs effects synchronously, captures the row registration. */
function fakeCtx() {
  let registerOptions: Record<string, unknown> | undefined
  const ctx = {
    effect: (fn: () => void) => { fn() },
    locale: { register: () => () => {} },
    slots: {
      inject: (_name: string, factory: () => unknown) => { factory() },
      register: (options: Record<string, unknown>, _component: unknown) => { registerOptions = options },
    },
    theme: { overrideTokens: () => () => {} },
  }
  return { ctx: ctx as unknown as Parameters<typeof apply>[0], registerOptions: () => registerOptions }
}

function mount() {
  const ctx = fakeCtx()
  apply(ctx.ctx)
  const options = ctx.registerOptions()
  if (options === undefined) throw new Error('row registration missing')
  const inject = options.inject as ((actions: unknown) => AppearanceCustomizerInjected) | undefined
  if (inject === undefined) throw new Error('row inject face missing')
  const store = createAppearanceRowStore().create()
  const face = inject(store.actions)
  return { store, face }
}

function storedSettings(): AppearanceSettings | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? undefined : JSON.parse(raw) as AppearanceSettings
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apply write path (localStorage)', () => {
  it('boots with the persisted section', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, accent: '#112233' }))
    const { store } = mount()
    expect(store.getSnapshot().settings.accent).toBe('#112233')
  })

  it('boots with defaults when nothing is persisted', () => {
    const { store } = mount()
    expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('boots with defaults when the persisted section is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const { store } = mount()
    expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('set persists synchronously and publishes to the store', () => {
    const { store, face } = mount()
    face.set('backgroundOpacity', 0.5)
    expect(storedSettings()?.backgroundOpacity).toBe(0.5)
    expect(store.getSnapshot().settings.backgroundOpacity).toBe(0.5)
  })

  it('applyPreset persists every role color and the preset id', () => {
    const { store, face } = mount()
    face.applyPreset('midnight')
    const stored = storedSettings()
    expect(stored?.preset).toBe('midnight')
    expect(stored?.background).toBe('#1b1e2c')
    expect(store.getSnapshot().settings.accent).toBe('#7c9cff')
  })

  it('resetAll restores the defaults and marks the preset default', () => {
    const { store, face } = mount()
    face.set('accent', '#4176e6')
    face.resetAll()
    expect(storedSettings()).toEqual({ ...DEFAULT_SETTINGS, preset: 'default' })
    expect(store.getSnapshot().settings.accent).toBe('')
  })

  it('setImage persists url and darkness together', () => {
    const { face } = mount()
    face.setImage({ url: 'data:image/webp;base64,AAAA', imageDark: true })
    expect(storedSettings()?.backgroundImage).toBe('data:image/webp;base64,AAAA')
    expect(storedSettings()?.imageDark).toBe(true)
    face.setImage(null)
    expect(storedSettings()?.backgroundImage).toBe('')
    expect(storedSettings()?.imageDark).toBe(false)
  })

  it('reloads and republishes when another tab writes the section', () => {
    const { store, face } = mount()
    face.set('accent', '#4176e6')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, accent: '#ff0000' }))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    expect(store.getSnapshot().settings.accent).toBe('#ff0000')
  })

  it('ignores storage events for other keys', () => {
    const { store, face } = mount()
    face.set('accent', '#4176e6')
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    expect(store.getSnapshot().settings.accent).toBe('#4176e6')
  })

  it('quota failures keep the in-memory state working', () => {
    const { store, face } = mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    face.set('accent', '#4176e6')
    expect(store.getSnapshot().settings.accent).toBe('#4176e6')
  })
})
