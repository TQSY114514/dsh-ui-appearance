/**
 * Shared IndexedDB database for the plugin's background blobs (videos and
 * images). One database, one version, one upgrade path: both object stores
 * are created idempotently so either store file can open the database first.
 */

/** Database identity. */
const DB_NAME = 'dsh-ui-appearance'
/**
 * Version bump when the record shape or store set changes. v2 adds the
 * `images` store alongside v1's `videos`. Both store files must open through
 * this module — a lower-version connection cannot open a database that has
 * already been upgraded.
 */
export const BLOB_DB_VERSION = 2

/** Object store holding background video blobs keyed by record id. */
export const VIDEO_STORE = 'videos'
/** Object store holding background image blobs keyed by record id. */
export const IMAGE_STORE = 'images'

/**
 * Open (and create/upgrade) the blob database, resolving once it is ready.
 * @returns the opened database connection.
 */
export function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, BLOB_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE)
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE)
    }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('indexeddb open failed')) }
  })
}

/**
 * Wrap one IDB transaction in a promise, resolving after the transaction commits.
 * @param storeName - object store the transaction touches.
 * @param mode - transaction mode.
 * @param action - the request to run against the store.
 * @returns the request's result, resolved only after commit.
 */
export function runBlobTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    openBlobDb().then((db) => {
      const transaction = db.transaction(storeName, mode)
      const request = action(transaction.objectStore(storeName))
      let result: T
      request.onsuccess = () => { result = request.result }
      request.onerror = () => { reject(request.error ?? new Error('indexeddb request failed')) }
      // Resolve only on commit: a writer resolving on the request's own
      // success can be read back too early by a fresh connection.
      transaction.oncomplete = () => { db.close(); resolve(result) }
      transaction.onerror = () => { reject(transaction.error ?? new Error('indexeddb transaction failed')) }
    }, reject)
  })
}

/** Generate one record key (time-ordered prefix + random suffix). */
export function newBlobKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
