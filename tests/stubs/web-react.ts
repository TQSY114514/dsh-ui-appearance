/**
 * Stub for the harness web-react bindings: connects a snapshot store to React
 * through useSyncExternalStore so the row re-renders when store actions run.
 */
import { useSyncExternalStore } from 'react'

/** Snapshot store shape the row consumes. */
export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Return a selector hook bound to one store instance. */
export function bindSnapshotSelector<T>(store: SnapshotStore<T>) {
  return (selector: (state: T) => unknown): unknown =>
    useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
}
