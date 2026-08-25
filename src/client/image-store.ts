/**
 * IndexedDB-backed storage for background images. Images ride the same
 * database as videos (blob-db.ts) so the settings section only carries a
 * short record key instead of a multi-megabyte data URL — the localStorage
 * quota never sees the payload.
 */
import { IMAGE_STORE, newBlobKey, runBlobTx } from './blob-db.ts'

/** One stored image record: the payload blob plus informational name. */
interface ImageRecord {
  /** Image payload (kept as a Blob; structured cloning holds it by reference). */
  data: Blob
  /** Original file name (informational). */
  name: string
}

/**
 * Store an image blob and return its record key.
 * @param blob - the image payload (original bytes, or resampled oversized ones).
 * @param name - original file name.
 * @returns the record key to persist in the settings section.
 */
export async function saveImage(blob: Blob, name: string): Promise<string> {
  const record: ImageRecord = { data: blob, name }
  const key = newBlobKey()
  await runBlobTx(IMAGE_STORE, 'readwrite', store => store.put(record, key))
  return key
}

/**
 * Load a stored image by key.
 * @param key - record key from the settings section.
 * @returns the image blob, or undefined when absent.
 */
export async function getImage(key: string): Promise<Blob | undefined> {
  const record = await runBlobTx(IMAGE_STORE, 'readonly', store => store.get(key) as IDBRequest<ImageRecord | undefined>)
  if (record === undefined) return undefined
  return record.data
}

/**
 * Delete a stored image by key.
 * @param key - record key to remove.
 * @returns settlement of the delete transaction.
 */
export function deleteImage(key: string): Promise<unknown> {
  return runBlobTx(IMAGE_STORE, 'readwrite', store => store.delete(key))
}
