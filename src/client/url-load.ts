/**
 * Loading background media from a remote URL: fetch the resource, then feed
 * it through the same image/video pipelines as local uploads (compression,
 * darkness sampling, IndexedDB storage). CORS-unfriendly hosts are reported
 * as a distinct user-facing error instead of a silent failure.
 */

import { MAX_INPUT_BYTES, readImageFile, type CompressedImage } from './image.ts'
import { MAX_VIDEO_BYTES } from './video-store.ts'

/** Media kinds the URL input can produce. */
export type UrlMediaKind = 'image' | 'video'

/** Video extensions the URL classifier recognizes. */
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/i

/** User-facing failure codes for remote loads. */
export type UrlLoadError = 'network' | 'cors' | 'http' | 'type' | 'size'

/** A remote-load failure carrying a user-facing code. */
export class UrlLoadFailure extends Error {
  /** The user-facing failure code. */
  public readonly code: UrlLoadError
  constructor(code: UrlLoadError) {
    super(code)
    this.code = code
  }
}

/**
 * Guess the media kind from the URL. Extension-based; unknown extensions
 * default to image (a wrong guess surfaces as a type error after fetch).
 * @param url - the remote URL.
 * @returns the guessed kind.
 */
export function classifyUrl(url: string): UrlMediaKind {
  return VIDEO_EXT.test(url) ? 'video' : 'image'
}

/**
 * Fetch a remote resource as a blob, mapping failures to user-facing codes.
 * @param url - the remote URL.
 * @returns the fetched blob.
 * @throws UrlLoadFailure with a 'cors', 'http' or 'network' code.
 */
export async function fetchBlob(url: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(url, { mode: 'cors' })
  } catch {
    // A cross-origin request without CORS headers rejects with a TypeError.
    throw new UrlLoadFailure('cors')
  }
  if (!response.ok) throw new UrlLoadFailure('http')
  let blob: Blob
  try {
    blob = await response.blob()
  } catch {
    throw new UrlLoadFailure('network')
  }
  if (blob.size === 0) throw new UrlLoadFailure('network')
  return blob
}

/** Derive a display name from the URL path. */
function urlToName(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop()
    return name !== undefined && name !== '' ? name : 'background'
  } catch {
    return 'background'
  }
}

/** Fallback MIME per guessed kind when the server omits Content-Type. */
function mimeFor(kind: UrlMediaKind): string {
  return kind === 'video' ? 'video/mp4' : 'image/jpeg'
}

/**
 * Load an image from a URL through the compression pipeline.
 * @param url - the remote image URL.
 * @returns the compressed result (data URL + darkness flag).
 * @throws UrlLoadFailure with a 'type' or 'size' code past the fetch stage.
 */
export async function loadImageFromUrl(url: string): Promise<CompressedImage> {
  const kind = classifyUrl(url)
  const blob = await fetchBlob(url)
  const type = blob.type === '' ? mimeFor(kind) : blob.type
  if (!type.startsWith('image/')) throw new UrlLoadFailure('type')
  if (blob.size > MAX_INPUT_BYTES) throw new UrlLoadFailure('size')
  return readImageFile(new File([blob], urlToName(url), { type }))
}

/**
 * Load a video from a URL into a File ready for the IndexedDB store.
 * @param url - the remote video URL.
 * @returns the video file.
 * @throws UrlLoadFailure with a 'type' or 'size' code past the fetch stage.
 */
export async function loadVideoFromUrl(url: string): Promise<File> {
  const kind = classifyUrl(url)
  const blob = await fetchBlob(url)
  const type = blob.type === '' ? mimeFor(kind) : blob.type
  if (!type.startsWith('video/')) throw new UrlLoadFailure('type')
  if (blob.size > MAX_VIDEO_BYTES) throw new UrlLoadFailure('size')
  return new File([blob], urlToName(url), { type })
}
