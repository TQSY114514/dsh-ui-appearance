/**
 * Minimal engine stub replacing the harness runtime for STANDALONE tests.
 * The real @deepseek-ai/dsh-client-runtime engine is unpublished and only
 * exists inside a harness checkout; this file implements just enough of the
 * defineStore/createSnapshotStore contract for the plugin's own store code,
 * which is what these tests exercise. The harness repo remains the authority
 * on engine behavior itself.
 */

/** Store action shape: first argument is the live draft, extras are the call args. */
type StoreAction<State> = (draft: State, ...args: unknown[]) => void

/** Handle returned by defineStore; create() mints one store instance. */
export interface EngineStoreHandle<State, Actions> {
  create(): {
    actions: Actions
    getSnapshot(): State
    subscribe(listener: () => void): () => void
  }
}

/**
 * Define a store from its init state and action table. Actions receive the
 * live draft as their first argument and notify subscribers after running,
 * mirroring the harness engine's draft-commit semantics.
 */
export function defineStore<State extends object, Actions extends Record<string, StoreAction<State>>>(
  def: { init(): State; actions: Actions },
): EngineStoreHandle<State, Actions> {
  return {
    create() {
      const draft = def.init()
      const listeners = new Set<() => void>()
      const actions = {} as Actions
      for (const [name, fn] of Object.entries(def.actions)) {
        ;(actions as Record<string, unknown>)[name] = (...args: unknown[]) => {
          ;(fn as (draft: State, ...args: unknown[]) => void)(draft, ...args)
          for (const listener of listeners) listener()
        }
      }
      return {
        actions,
        getSnapshot: () => draft,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    },
  }
}

/** Minimal snapshot store (static state) for the row's unused global hooks. */
export function createSnapshotStore<T>(
  init: T,
): { getSnapshot(): T; subscribe(listener: () => void): () => void } {
  return { getSnapshot: () => init, subscribe: () => () => {} }
}
