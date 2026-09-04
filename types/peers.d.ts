/**
 * Minimal type declarations for the host-provided `@deepseek-ai/*` peers.
 *
 * The standalone repository never installs these packages (they are
 * optional peers resolved by the DeepSeek Harness host at runtime), so this
 * file supplies just enough shape for `tsc --noEmit` and editor tooling.
 * Keep the members in sync with what `src/**` actually consumes.
 */
import type { ReactNode } from 'react'

declare module '@deepseek-ai/dsh-invariants' {
  /** Companion installer: a no-op function for packages without an invariant. */
  export type InvariantInstaller = () => void

  /** Invariants service: reserves package ownership. */
  export interface InvariantsService {
    register(packageName: string, installer: InvariantInstaller): void
  }
}

declare module '@deepseek-ai/cordis' {
  /** Host-side cordis context (empty apply half uses almost none of it). */
  export interface Context {
    invariants: {
      register(packageName: string, installer: () => void): () => void
    }
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  /** Client cordis context with the services this plugin injects. */
  export interface ClientContext {
    effect(fn: () => void | (() => void), reason: string): void
    locale: {
      register(namespace: string, dictionaries: Record<string, unknown>): void
    }
    theme: {
      overrideTokens(
        source: string,
        tokens: Record<string, { light: string; dark: string }>,
      ): (() => void) | undefined
    }
    slots: {
      inject(name: string, factory: () => unknown): unknown
      register(spec: unknown, component?: unknown): unknown
    }
    [key: string]: unknown
  }

  /** Store factory result: `create()` builds the reactive state and the
   * partially-applied actions (each action's leading draft parameter is
   * bound by the harness, so callers pass only the real arguments). */
  export type EngineStoreHandle<S, A extends Record<string, (...args: any[]) => any>> = {
    create(): {
      state: S
      actions: {
        [K in keyof A]: A[K] extends (draft: S, ...rest: infer R) => infer Ret
          ? (...rest: R) => Ret
          : never
      }
      getSnapshot(): S
      setState(partial: Partial<S>): void
      subscribe(listener: () => void): () => void
    }
  }

  /** Declare a reactive store from an init + actions spec. The harness
   * partially applies each action with the draft state, so the exposed
   * actions drop the leading draft parameter. */
  export function defineStore<S, A extends Record<string, (draft: S, ...rest: any[]) => any>>(spec: {
    init: () => S
    actions: A
  }): EngineStoreHandle<S, A>

  /** Plain snapshot store used by tests to drive the row's runtime seat. */
  export function createSnapshotStore<S>(initial: S): {
    getSnapshot(): S
    setState(partial: Partial<S>): void
    subscribe(listener: () => void): () => void
  }

  /** Session list state shape consumed by the row spec. */
  export interface SessionListState {
    ids: string[]
    byId: Record<string, unknown>
    current: unknown
    phase: string
    [key: string]: unknown
  }

  /** Workspace list state shape consumed by the row spec. */
  export interface WorkspaceListState {
    items: unknown[]
    archivedSessionIds: string[]
    state: string
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-client-store' {
  /** Declare a reactive store from an init + actions spec. */
  export function defineStore<S, A extends Record<string, (draft: S, ...rest: any[]) => any>>(spec: {
    init: () => S
    actions: A
  }): import('@deepseek-ai/dsh-client-runtime/client').EngineStoreHandle<S, A>
}

declare module '@deepseek-ai/dsh-client-web-react' {
  /** Bind a snapshot store into a selector hook (test seat). */
  export function bindSnapshotSelector<S>(store: {
    getSnapshot(): S
    subscribe(listener: () => void): () => void
  }): <R>(selector: (state: S) => R) => R
}

declare module '@deepseek-ai/dsh-client-ui-theme/client' {
  /** Token override pairs per mode, as consumed by `ctx.theme.overrideTokens`. */
  export type ThemeTokenOverrides = Record<string, { light: string; dark: string }>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  /** Locale seat: `t` resolves a copy key (loosely typed shim). */
  export interface PropsLocale<K extends string> {
    t: (key: string) => string
  }

  /** Slot-store seat: `useStore` reads the registered row store. */
  export interface PropsStore<T> {
    useStore: <R>(selector: (state: T extends { create(): { state: infer S } } ? S : never) => R) => R
  }

  /** Runtime seat: owner params and framework hooks. */
  export type PropsRuntime<S extends string> = Record<string, unknown>

  /** Actions bound to the store handle. */
  export interface BoundActions<S> {
    sync(snapshot: unknown, revision: number): void
  }

  /** Locale namespace registry (augmented by the plugin). */
  export interface LocaleNamespaceMap {}
}

declare module '@deepseek-ai/dsh-client-ui-settings/client' {
  /** Settings-scope declarations (type-only imports; nothing consumed directly). */
  export {}
}

declare module '@deepseek-ai/dsh-client-locale/client' {
  /** Locale-service declarations (type-only imports). */
  export {}
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  /** Disclosure row: expandable settings row wrapper. */
  export function DisclosureRow(props: {
    title?: string
    icon?: ReactNode
    open?: boolean
    expandable?: boolean
    expandOnRowClick?: boolean
    onToggle?: () => void
    children?: ReactNode
  }): ReactNode

  /** Personalization icon used by the row title. */
  export function IconPersonalizationOutline16(props: Record<string, unknown>): ReactNode
}
