/**
 * Scene Engine main pipeline for Wallpaper Engine Scene Renderer.
 */
import { setupSceneCamera } from './camera.ts'
import { renderImageLayer, resolveObjectTransform } from './image-layer.ts'
import { parseVec3 } from './math.ts'
import { renderParticleSystem } from './particle.ts'
import type { RenderedFrame, SceneAccess, SceneJson, SceneObjectJson } from './types.ts'

export interface SceneRenderOptions {
  time?: number
  targetWidth?: number
  targetHeight?: number
}

/**
 * Render a complete Wallpaper Engine Scene project at a given timestamp.
 */
export function renderScene(
  scene: SceneJson,
  access: SceneAccess,
  options: SceneRenderOptions = {},
): RenderedFrame {
  const objects = scene.objects || []
  const general = scene.general

  const width = options.targetWidth || general?.projection?.width || 1920
  const height = options.targetHeight || general?.projection?.height || 1080
  const time = options.time || 0

  const canvas = new Uint8Array(width * height * 4)

  // 1. Scene background clear color
  const clearColor = general?.clearenabled !== false ? parseVec3(general?.clearcolor, [0, 0, 0]) : null
  if (clearColor) {
    const r = Math.round(clearColor[0] * 255)
    const g = Math.round(clearColor[1] * 255)
    const b = Math.round(clearColor[2] * 255)
    for (let i = 0; i < width * height; i++) {
      canvas[i * 4] = r
      canvas[i * 4 + 1] = g
      canvas[i * 4 + 2] = b
      canvas[i * 4 + 3] = 255
    }
  }

  // 2. Setup camera
  const camera = setupSceneCamera(scene, width, height)

  // 3. Map objects by ID for parent resolution
  const objectsById = new Map<number, SceneObjectJson>()
  for (const obj of objects) {
    if (obj.id !== undefined) objectsById.set(obj.id, obj)
  }

  // 4. Render objects in order
  for (const obj of objects) {
    const tr = resolveObjectTransform(obj, objectsById)
    if (!tr.visible) continue

    // Handle image / model layers
    if (obj.image || obj.model) {
      renderImageLayer(canvas, width, height, obj, tr, access)
    }

    // Handle particle systems
    if (obj.particle) {
      renderParticleSystem(canvas, width, height, obj, tr, access, time)
    }
  }

  return { width, height, rgba: canvas }
}
