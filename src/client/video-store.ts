/**
 * IndexedDB-backed storage for background videos. Videos are too large for
 * localStorage, so the settings section only carries the record key; the
 * blob lives here and is streamed into the background layer on demand.
 * Database open/upgrade lives in blob-db.ts (shared with image-store).
 */
import { newBlobKey, runBlobTx, VIDEO_STORE } from './blob-db.ts'

/** Video upload cap (bytes); larger files are refused up front. Matches the
 * image limit — videos are stored as Blob references in IndexedDB, so the
 * cap guards sanity, not memory. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/** MIME types plus extensions accepted by the video upload control. Some
 * containers (.mov, .mkv) arrive with an empty or uncommon MIME type
 * depending on the OS and browser, so the dialog also filters by
 * extension — otherwise those files are greyed out and unselectable. */
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', '.mp4', '.webm', '.ogv', '.ogg', '.mov', '.mkv', '.m4v']

/** Whether a picked or dropped file should be routed to the video pipeline.
 * MIME is preferred but not trusted — when it is missing, the file name
 * extension is the fallback gate. Either way the decoder stays the final
 * authority: anything it cannot play surfaces the codec hint. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov|mkv|m4v)$/i.test(file.name)
}

/** One stored video record. New records keep the payload as a Blob —
 * IDB structured cloning holds it by reference, so the bytes never have to
 * fit in memory all at once. Legacy records (pre-Blob) hold raw bytes plus
 * their MIME type. */
interface VideoRecord {
  /** Video payload (Blob for new records, ArrayBuffer for legacy ones). */
  data: Blob | ArrayBuffer
  /** Video MIME type (only set on legacy ArrayBuffer records). */
  type?: string
  /** Original file name (informational). */
  name: string
}

/**
 * Store a video blob and return its record key.
 * @param blob - the video payload.
 * @param name - original file name.
 * @returns the record key to persist in the settings section.
 */
export async function saveVideo(blob: Blob, name: string): Promise<string> {
  if (blob.size > MAX_VIDEO_BYTES) {
    throw new Error(`video exceeds the ${MAX_VIDEO_BYTES / 1024 / 1024}MB limit`)
  }
  // Store the Blob itself: structured cloning keeps it by reference, so a
  // large video is never fully read into memory on the save path.
  const record: VideoRecord = { data: blob, name }
  const key = newBlobKey()
  await runBlobTx(VIDEO_STORE, 'readwrite', store => store.put(record, key))
  return key
}

/**
 * Load a stored video by key, materialized back into a Blob.
 * @param key - record key from the settings section.
 * @returns the video blob, or undefined when absent.
 */
export async function getVideo(key: string): Promise<Blob | undefined> {
  const record = await runBlobTx(VIDEO_STORE, 'readonly', store => store.get(key) as IDBRequest<VideoRecord | undefined>)
  if (record === undefined) return undefined
  // New records come back as Blobs with their MIME type intact; legacy
  // records carry raw bytes and get rewrapped here.
  if (record.data instanceof Blob) return record.data
  return new Blob([record.data], { type: record.type ?? '' })
}

/**
 * Delete a stored video by key.
 * @param key - record key to remove.
 * @returns settlement of the delete transaction.
 */
export function deleteVideo(key: string): Promise<unknown> {
  return runBlobTx(VIDEO_STORE, 'readwrite', store => store.delete(key))
}
