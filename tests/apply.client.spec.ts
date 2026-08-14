// @vitest-environment jsdom
/** Plugin write path: optimistic edits survive stale scope settlements. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../src/appearance-settings.ts'
import { apply } from '../src/client/index.ts'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { AppearanceCustomizerInjected } from '../src/client/AppearanceCustomizerRow.tsx'

/** Minimal scope double: manual publish, recorded writes, sync listeners. */
function fakeHost() {
  let snapshot: SettingsScopeSnapshot<AppearanceSettings> = {
    status: 'ready',
    value: { ...DEFAULT_SETTINGS },
    base: undefined,
    user: undefined,
    revision: 0,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set<() => void>()
  const writes: Array<{ field: string; value: unknown }> = []
  const host = {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: (field: string, value: unknown) => { writes.push({ field, value }); return Promise.resolve() },
    publish: (next: { value: AppearanceSettings; revision: number }) => {
      snapshot = { ...snapshot, ...next }
      for (const fn of [...listeners]) fn()
    },
  }
  return { host: host as unknown as SettingsScope<AppearanceSettings>, writes, publish: host.publish }
}

/** Minimal cordis client context: runs effects synchronously, captures the row registration. */
function fakeCtx(host: SettingsScope<AppearanceSettings>) {
  let registerOptions: Record<string, unknown> | undefined
  const ctx = {
    settingsScope: { bind: () => host },
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
  const fake = fakeHost()
  const ctx = fakeCtx(fake.host)
  apply(ctx.ctx)
  const options = ctx.registerOptions()
  if (options === undefined) throw new Error('row registration missing')
  const inject = options.inject as ((actions: unknown) => AppearanceCustomizerInjected) | undefined
  if (inject === undefined) throw new Error('row inject face missing')
  const store = createAppearanceRowStore().create()
  const face = inject(store.actions)
  return { ...fake, store, face }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('apply write path', () => {
  it('keeps the latest optimistic value across a stale settlement (no snap-back)', () => {
    const { writes, publish, store, face } = mount()
    face.set('backgroundOpacity', 0.5)
    vi.advanceTimersByTime(120) // debounce flush writes 0.5
    expect(writes).toEqual([{ field: 'backgroundOpacity', value: 0.5 }])

    face.set('backgroundOpacity', 0.7) // newer edit, not yet flushed
    // A stale settlement (the previous write's view) lands before the flush:
    publish({ value: { ...DEFAULT_SETTINGS, backgroundOpacity: 0.5 }, revision: 1 })
    expect(store.getSnapshot().settings.backgroundOpacity).toBe(0.7)

    vi.advanceTimersByTime(120) // pending flush writes the newest value
    expect(writes[1]).toEqual({ field: 'backgroundOpacity', value: 0.7 })

    // The real settlement of the newest write lands and clears the overlay:
    publish({ value: { ...DEFAULT_SETTINGS, backgroundOpacity: 0.7 }, revision: 2 })
    expect(store.getSnapshot().settings.backgroundOpacity).toBe(0.7)
    // Overlay cleared: a later stale snapshot is adopted as-is again.
    publish({ value: { ...DEFAULT_SETTINGS, backgroundOpacity: 0.5 }, revision: 3 })
    expect(store.getSnapshot().settings.backgroundOpacity).toBe(0.5)
  })

  it('resetAll keeps its optimistic reset across an in-flight stale settlement', () => {
    const { publish, store, face } = mount()
    face.set('accent', '#4176e6')
    vi.advanceTimersByTime(120) // accent write queued
    face.resetAll()
    // Stale settlement of the accent write lands while the reset is in flight:
    publish({ value: { ...DEFAULT_SETTINGS, accent: '#4176e6' }, revision: 1 })
    const settings = store.getSnapshot().settings
    expect(settings.accent).toBe('')
    expect(settings.preset).toBe('default')
    expect(settings.backgroundOpacity).toBe(1)
    // The reset's own settlement lands:
    publish({ value: { ...DEFAULT_SETTINGS, preset: 'default' }, revision: 2 })
    expect(store.getSnapshot().settings.accent).toBe('')
  })

  it('adopts the initial scope snapshot without any optimistic overlay', () => {
    const { writes, publish, store } = mount()
    publish({ value: { ...DEFAULT_SETTINGS, accent: '#112233' }, revision: 1 })
    expect(store.getSnapshot().settings.accent).toBe('#112233')
    expect(writes).toEqual([])
  })
})
