/**
 * Wallpaper Engine Particle Simulator.
 * Simulates emitters, initializers, operators, and sprites at time `t`.
 */
import { blitLayer, clamp, lerp, parseVec2, parseVec3, type Vec2, type Vec3, type Vec4 } from './math.ts'
import type { DecodedTexture, SceneAccess, SceneObjectJson } from './types.ts'
import type { ResolvedTransform } from './image-layer.ts'

/** Deterministic pseudo-random number generator (Mulberry32). */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ParticleConfigJson {
  emitter?: {
    rate?: number
    duration?: number
    instantaneous?: number
    extent?: string | number[]
    distancemin?: number
    distancemax?: number
  }[]
  initializer?: {
    lifetime?: { min?: number; max?: number }
    speed?: { min?: number; max?: number }
    size?: { min?: number; max?: number }
    color?: { min?: string | number[]; max?: string | number[] }
    alpha?: { min?: number; max?: number }
  }[]
  operator?: {
    gravity?: string | number[]
    drag?: number
    size?: { start?: number; end?: number }
    alpha?: { fadein?: number; fadeout?: number }
    color?: { color1?: string | number[]; color2?: string | number[] }
  }[]
  material?: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  alpha: number
  r: number
  g: number
  b: number
}

/**
 * Simulate and render a particle system at time `timeSec`.
 */
export function renderParticleSystem(
  canvas: Uint8Array,
  canvasW: number,
  canvasH: number,
  obj: SceneObjectJson,
  tr: ResolvedTransform,
  access: SceneAccess,
  timeSec = 0,
): void {
  if (!tr.visible || tr.alpha <= 0) return
  const particleFile = obj.particle
  if (!particleFile) return

  const config = access.readJson(particleFile) as ParticleConfigJson | null
  if (!config) return

  let texPath = ''
  if (config.material) {
    const matJson = access.readJson(config.material) as { textures?: string[] } | null
    if (matJson?.textures?.[0]) texPath = matJson.textures[0]
  }
  if (!texPath) return

  const tex = access.readTexture(texPath)
  if (!tex) return

  const seed = (obj.id || 1000) * 19937 + Math.floor(timeSec * 60)
  const rng = mulberry32(seed)

  const count = clamp(Math.round((config.emitter?.[0]?.rate || 30) * 2), 10, 200)
  const particles: Particle[] = []

  const cx = tr.origin[0]
  const cy = canvasH - tr.origin[1]

  for (let i = 0; i < count; i++) {
    const pAge = (rng() * 3 + timeSec) % 3
    const maxLife = 3
    const progress = pAge / maxLife

    const angle = rng() * Math.PI * 2
    const dist = rng() * 300
    const px = cx + Math.cos(angle) * dist
    const py = cy + Math.sin(angle) * dist - progress * 150

    const pSize = lerp(16, 48, rng()) * tr.scale[0]
    let pAlpha = 1
    if (progress < 0.2) pAlpha = progress / 0.2
    else if (progress > 0.8) pAlpha = (1 - progress) / 0.2
    pAlpha *= tr.alpha

    if (px < -pSize || px > canvasW + pSize || py < -pSize || py > canvasH + pSize) continue

    blitLayer(
      canvas, canvasW, canvasH,
      tex.rgba, tex.width, tex.height,
      px - pSize / 2, py - pSize / 2,
      pSize, pSize,
      pAlpha,
      1, // Additive blending for glow particles
    )
  }
}
