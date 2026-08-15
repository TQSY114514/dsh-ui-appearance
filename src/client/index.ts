/**
 * Appearance customization plugin, browser half. Persists the `ui-appearance`
 * settings section in localStorage (the harness settings gateway only exposes
 * its hard-coded product namespaces to browser clients, so a third-party
 * namespace cannot be written through the settings RPC), projects every
 * change onto the document through the DOM applier (theme token overrides +
 * background layer), and registers the customizer row into the settings
 * General section. Writes are synchronous: update the section, persist it,
 * publish to the store and the applier. Cross-tab sync rides the `storage`
 * event.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale and theme Context merges plus the settings
// slot declarations ('settings.general.item' lives in the settings domain's
// client contract). No settings scope: the gateway refuses non-product
// namespaces, so settings persist in localStorage instead.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { AppearanceCustomizerInjected } from './AppearanceCustomizerRow.tsx'
import { AppearanceCustomizerRow } from './AppearanceCustomizerRow.tsx'
import { createAppearanceRowStore } from './settings-store.ts'
import { en, zh, type AppearanceKey } from './locales.ts'
import {
  APPEARANCE_ROLES, DEFAULT_SETTINGS,
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

/** Required services: slots/locale for the row, theme for token overrides. */
export const inject = ['slots', 'locale', 'theme']

/** localStorage key holding the whole settings section. */
export const STORAGE_KEY = 'dsh-ui-appearance.settings'

/**
 * Read the persisted section, tolerating a missing or corrupt entry.
 * @returns the stored settings, or the stock defaults.
 */
function readStoredSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch (_unreadableStorage) {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Client plugin body: load the persisted section, mount the DOM applier, and
 * register the customizer row into the General section.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-appearance: settings row dictionaries')

  const store = createAppearanceRowStore()
  let bound: BoundActions<typeof store> | undefined
  let current: AppearanceSettings = readStoredSettings()
  let revision = 0
  let applier: AppearanceApplier | undefined

  const publish = (): void => {
    revision += 1
    bound?.sync(current, revision)
    applier?.apply(current)
  }

  // DOM applier: created once, retracts everything on dispose.
  ctx.effect(() => {
    applier = new AppearanceApplier(ctx)
    applier.apply(current)
    return () => {
      applier?.dispose()
      applier = undefined
    }
  }, 'ui-appearance: DOM applier')

  // Cross-tab sync: another tab persisted a section change.
  ctx.effect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== STORAGE_KEY) return
      current = readStoredSettings()
      publish()
    }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('storage', onStorage) }
  }, 'ui-appearance: storage sync')

  const commit = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch (_storageQuota) {
      // Quota exceeded (e.g. an oversized image): keep the in-memory state so
      // this session still works; the change just does not survive a reload.
    }
    publish()
  }
  const set = (field: keyof AppearanceSettings, value: string | number): void => {
    const patch = { ...current }
    // The union key cannot be assigned through the keyed type (mixed string /
    // number fields intersect to never), so write through an index view.
    ;(patch as Record<string, string | number | boolean>)[field] = value
    current = patch
    commit()
  }
  const setImage = (image: { url: string; imageDark: boolean } | null): void => {
    const patch = { ...current }
    patch.backgroundImage = image?.url ?? ''
    patch.imageDark = image?.imageDark ?? false
    // Image and video backgrounds are mutually exclusive.
    if (image !== null) patch.backgroundVideo = ''
    current = patch
    commit()
  }
  const setVideo = (key: string | null): void => {
    const patch = { ...current }
    patch.backgroundVideo = key ?? ''
    // Image and video backgrounds are mutually exclusive.
    if (key !== null) {
      patch.backgroundImage = ''
      patch.imageDark = false
    }
    current = patch
    commit()
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
    commit()
  }
  const resetAll = (): void => {
    current = { ...DEFAULT_SETTINGS, preset: 'default' }
    commit()
  }

  const injected = (actions: BoundActions<typeof store>): AppearanceCustomizerInjected => {
    bound = actions
    // Push the initial section so the row renders the persisted values.
    publish()
    return { set, setImage, setVideo, applyPreset, resetAll }
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
