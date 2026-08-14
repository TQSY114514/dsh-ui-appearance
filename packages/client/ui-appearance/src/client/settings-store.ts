/**
 * Appearance row slot store: a mirror of the settings scope section plus
 * optimistic patches from the row's own write path. The apply-world change
 * listener is the authoritative writer; the injected `set` patches first so
 * sliders and pickers feel instant, then the scope round-trip reconciles.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { AppearanceSettings } from '../appearance-settings.ts'
import { DEFAULT_SETTINGS } from '../appearance-settings.ts'

/** Store state mirrored from the settings scope. */
export interface AppearanceRowState {
  /** Current settings; the store always holds a complete section. */
  settings: AppearanceSettings
  /** Host document revision; -1 until the first scope snapshot lands. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, settings: AppearanceSettings, revision: number) => void
  patch: (draft: AppearanceRowState, partial: Partial<AppearanceSettings>) => void
}

/**
 * Declares the Appearance customizer row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ settings: { ...DEFAULT_SETTINGS }, revision: -1 }),
    actions: {
      sync: (d, settings, revision) => {
        if (revision <= d.revision) return
        d.settings = { ...settings }
        d.revision = revision
      },
      patch: (d, partial) => {
        d.settings = { ...d.settings, ...partial }
      },
    },
  })
}
