/**
 * Appearance customization plugin, browser half. Binds the `ui-appearance`
 * settings scope, projects every accepted snapshot onto the document through
 * the DOM applier (theme token overrides + background layer), and registers
 * the customizer row into the settings General section. The scope is the
 * single source of truth: writes queue through it, its subscription feeds
 * both the applier and the row store.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings scope, locale, and theme Context merges
// (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceCustomizerInjected } from './AppearanceCustomizerRow.tsx'
import { AppearanceCustomizerRow } from './AppearanceCustomizerRow.tsx'
import { createAppearanceRowStore } from './settings-store.ts'
import { en, zh, type AppearanceKey } from './locales.ts'
import {
  APPEARANCE_ROLES, APPEARANCE_SETTINGS_NAMESPACE, DEFAULT_SETTINGS,
  type AppearanceSettings,
} from '../appearance-settings.ts'
import { APPEARANCE_PRESETS } from './tokens.ts'
import { AppearanceApplier } from './applier.ts'

export type { AppearanceCustomizerComponentProps, AppearanceCustomizerInjected } from './AppearanceCustomizerRow.tsx'
export type { AppearanceRowState } from './settings-store.ts'
export type { AppearanceKey } from './locales.ts'
export type { AppearanceSettings } from '../appearance-settings.ts'

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.appearance'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The appearance customizer row's copy. */
    'settings.appearance': AppearanceKey
  }
}

/** Required services: slots/locale for the row, settings transport, theme for overrides. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope', 'theme']

/** Debounce for coalescing slider bursts into one settings write round. */
const FLUSH_DEBOUNCE_MS = 120

/**
 * Client plugin body: bind the scope, mount the DOM applier, and register the
 * customizer row into the General section.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const host = ctx.settingsScope.bind<AppearanceSettings>({ namespace: APPEARANCE_SETTINGS_NAMESPACE })

  // DOM applier: rebuild on every scope change, retract everything on dispose.
  ctx.effect(() => {
    const applier = new AppearanceApplier(ctx)
    applier.apply(host.getSnapshot().value)
    const off = host.subscribe(() => { applier.apply(host.getSnapshot().value) })
    return () => { off(); applier.dispose() }
  }, 'ui-appearance: DOM applier')

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-appearance: settings row dictionaries')

  const store = createAppearanceRowStore()
  let bound: BoundActions<typeof store> | undefined
  let current: AppearanceSettings = { ...DEFAULT_SETTINGS }
  let appliedRevision = -1
  const dirty = new Set<keyof AppearanceSettings>()
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  const sync = (): void => {
    const snapshot = host.getSnapshot()
    if (snapshot.value === undefined) return
    const revision = snapshot.revision ?? 0
    if (revision <= appliedRevision) return
    appliedRevision = revision
    current = { ...snapshot.value }
    bound?.sync(current, revision)
  }
  const off = host.subscribe(sync)
  ctx.effect(() => () => { off() }, 'ui-appearance: scope sync')

  const flush = (): void => {
    if (flushTimer !== undefined) { clearTimeout(flushTimer); flushTimer = undefined }
    for (const field of dirty) void host.set(field, current[field])
    dirty.clear()
  }
  const scheduleFlush = (): void => {
    if (flushTimer !== undefined) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS)
  }
  const set = (field: keyof AppearanceSettings, value: string | number): void => {
    const patch = { ...current }
    // The union key cannot be assigned through the keyed type (mixed string /
    // number fields intersect to never), so write through an index view.
    ;(patch as Record<string, string | number>)[field] = value
    current = patch
    bound?.patch(patch)
    dirty.add(field)
    scheduleFlush()
  }
  const setImage = (dataUrl: string | null): void => {
    set('backgroundImage', dataUrl ?? '')
    flush()
  }
  const applyPreset = (id: string): void => {
    const preset = APPEARANCE_PRESETS.find(candidate => candidate.id === id)
    if (preset === undefined) return
    const partial: Partial<AppearanceSettings> = { preset: id }
    if (id === 'default') {
      for (const role of APPEARANCE_ROLES) partial[role] = ''
    } else {
      for (const [role, hex] of Object.entries(preset.colors)) {
        if (hex === undefined) continue
        ;(partial as Record<string, string>)[role] = hex
      }
    }
    current = { ...current, ...partial }
    bound?.patch(partial)
    for (const field of Object.keys(partial) as (keyof AppearanceSettings)[]) dirty.add(field)
    flush()
  }
  const resetAll = (): void => {
    const next: AppearanceSettings = { ...DEFAULT_SETTINGS, preset: 'default' }
    current = next
    bound?.patch(next)
    for (const field of Object.keys(next) as (keyof AppearanceSettings)[]) dirty.add(field)
    flush()
  }

  const injected = (actions: BoundActions<typeof store>): AppearanceCustomizerInjected => {
    bound = actions
    // Re-sync from the getter so no snapshot is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync()
    return { set, setImage, applyPreset, resetAll }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'appearance-custom',
    order: 20,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, AppearanceCustomizerRow))
}
