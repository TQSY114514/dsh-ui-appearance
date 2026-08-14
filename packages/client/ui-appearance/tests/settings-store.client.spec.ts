/** Appearance row store: mirror sync with revision guard and optimistic patch. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/appearance-settings.ts'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'

describe('createAppearanceRowStore', () => {
  it('init shape: stock settings with revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ settings: DEFAULT_SETTINGS, revision: -1 })
  })

  it('sync mirrors the settings and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    const next = { ...DEFAULT_SETTINGS, accent: '#4176e6' }
    store.actions.sync(next, 0)
    expect(store.getSnapshot().settings.accent).toBe('#4176e6')
    expect(store.getSnapshot().revision).toBe(0)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    const first = { ...DEFAULT_SETTINGS, accent: '#111111' }
    const second = { ...DEFAULT_SETTINGS, accent: '#222222' }
    store.actions.sync(first, 3)
    store.actions.sync(second, 2)
    store.actions.sync(second, 3)
    expect(store.getSnapshot().settings.accent).toBe('#111111')
    expect(store.getSnapshot().revision).toBe(3)
  })

  it('patch merges optimistically without touching the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync({ ...DEFAULT_SETTINGS, accent: '#111111' }, 1)
    store.actions.patch({ accent: '#222222', backgroundBlur: 10 })
    const snapshot = store.getSnapshot()
    expect(snapshot.settings.accent).toBe('#222222')
    expect(snapshot.settings.backgroundBlur).toBe(10)
    expect(snapshot.revision).toBe(1)
  })
})
