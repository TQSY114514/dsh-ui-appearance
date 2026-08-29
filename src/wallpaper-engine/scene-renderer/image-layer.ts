/**
 * Image layer transform resolution and rasterization for Scene Renderer.
 */
import { blitLayer, parseVec2, parseVec3, type Vec2, type Vec3 } from './math.ts'
import type { DecodedTexture, SceneAccess, SceneObjectJson } from './types.ts'

export interface ResolvedTransform {
  origin: Vec3
  angles: Vec3
  scale: Vec3
  alpha: number
  visible: boolean
}

/**
 * Resolve hierarchical transform along the parent chain (up to 32 levels).
 */
export function resolveObjectTransform(
  obj: SceneObjectJson,
  objectsById: Map<number, SceneObjectJson>,
): ResolvedTransform {
  let origin = parseVec3(obj.origin, [0, 0, 0])
  let angles = parseVec3(obj.angles, [0, 0, 0])
  let scale = parseVec3(obj.scale, [1, 1, 1])
  let alpha = typeof obj.alpha === 'number' && Number.isFinite(obj.alpha) ? Math.min(1, Math.max(0, obj.alpha)) : 1

  let visible = true
  if (obj.visible === false) visible = false
  else if (typeof obj.visible === 'object' && obj.visible !== null && obj.visible.value === false) visible = false

  let current = obj
  let depth = 0

  while (current.parent !== undefined && depth < 32) {
    const parent = objectsById.get(current.parent)
    if (!parent) break
    if (parent.visible === false || (typeof parent.visible === 'object' && parent.visible?.value === false)) {
      visible = false
    }

    const parentScale = parseVec3(parent.scale, [1, 1, 1])
    const parentOrigin = parseVec3(parent.origin, [0, 0, 0])

    scale = [scale[0] * parentScale[0], scale[1] * parentScale[1], scale[2] * parentScale[2]]
    origin = [origin[0] * parentScale[0] + parentOrigin[0], origin[1] * parentScale[1] + parentOrigin[1], origin[2] + parentOrigin[2]]
    if (typeof parent.alpha === 'number') alpha *= Math.min(1, Math.max(0, parent.alpha))

    current = parent
    depth++
  }

  return { origin, angles, scale, alpha, visible }
}

/**
 * Render one image object onto the scene canvas.
 */
export function renderImageLayer(
  canvas: Uint8Array,
  canvasW: number,
  canvasH: number,
  obj: SceneObjectJson,
  tr: ResolvedTransform,
  access: SceneAccess,
): void {
  if (!tr.visible || tr.alpha <= 0) return

  const imagePath = obj.image
  if (!imagePath) return

  // Try model descriptor if available to get actual texture reference and size
  let texPath = imagePath
  let declaredW = 0
  let declaredH = 0

  if (imagePath.endsWith('.json')) {
    const modelJson = access.readJson(imagePath) as {
      material?: string
      width?: number
      height?: number
      cropoffset?: string
      fullscreen?: boolean
    } | null

    if (modelJson) {
      if (typeof modelJson.width === 'number') declaredW = modelJson.width
      if (typeof modelJson.height === 'number') declaredH = modelJson.height
      if (typeof modelJson.material === 'string') {
        const matJson = access.readJson(modelJson.material) as { textures?: string[] } | null
        if (matJson?.textures?.[0]) texPath = matJson.textures[0]
      }
    }
  }

  const tex = access.readTexture(texPath)
  if (!tex) return

  let lw = declaredW > 0 ? declaredW : tex.width
  let lh = declaredH > 0 ? declaredH : tex.height

  if (obj.size) {
    const size = parseVec2(obj.size, [lw, lh])
    if (size[0] > 0) lw = size[0]
    if (size[1] > 0) lh = size[1]
  }

  lw *= Math.abs(tr.scale[0]) || 1
  lh *= Math.abs(tr.scale[1]) || 1

  let cx = tr.origin[0]
  let cy = tr.origin[1]

  const alignment = (obj.alignment || '').toLowerCase()
  if (alignment.includes('left')) cx += lw / 2
  else if (alignment.includes('right')) cx -= lw / 2
  if (alignment.includes('top')) cy -= lh / 2
  else if (alignment.includes('bottom')) cy += lh / 2

  // Wallpaper Engine uses Y-up (Y=0 at bottom), convert to top-down canvas Y
  const cyTopDown = canvasH - cy
  const dx = cx - lw / 2
  const dy = cyTopDown - lh / 2

  blitLayer(canvas, canvasW, canvasH, tex.rgba, tex.width, tex.height, dx, dy, lw, lh, tr.alpha)
}
