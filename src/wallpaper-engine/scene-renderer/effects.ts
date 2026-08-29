/**
 * Wallpaper Engine Shader Effects library (CPU/Canvas rasterization).
 */
import { clamp } from './math.ts'
import type { DecodedTexture, SceneAccess, SceneEffectJson } from './types.ts'

/**
 * Apply effect chain onto an RGBA texture/layer.
 */
export function applyEffects(
  rgba: Uint8Array,
  width: number,
  height: number,
  effects: SceneEffectJson[] | undefined,
  access: SceneAccess,
  timeSec = 0,
): Uint8Array {
  if (!effects || effects.length === 0) return rgba

  let current = new Uint8Array(rgba)

  for (const eff of effects) {
    if (eff.visible === false) continue
    const name = (eff.name || eff.file || '').toLowerCase()

    if (name.includes('tint')) {
      current = applyTintEffect(current, width, height)
    } else if (name.includes('pulse')) {
      current = applyPulseEffect(current, width, height, timeSec)
    } else if (name.includes('filmgrain') || name.includes('grain')) {
      current = applyFilmGrainEffect(current, width, height, timeSec)
    }
  }

  return current
}

function applyTintEffect(rgba: Uint8Array, width: number, height: number): Uint8Array {
  // Pass-through or subtle color adjustment
  return rgba
}

function applyPulseEffect(rgba: Uint8Array, width: number, height: number, timeSec: number): Uint8Array {
  const pulse = Math.sin(timeSec * 2) * 0.15 + 1.0
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = clamp(Math.round(rgba[i] * pulse), 0, 255)
    out[i + 1] = clamp(Math.round(rgba[i + 1] * pulse), 0, 255)
    out[i + 2] = clamp(Math.round(rgba[i + 2] * pulse), 0, 255)
    out[i + 3] = rgba[i + 3]
  }
  return out
}

function applyFilmGrainEffect(rgba: Uint8Array, width: number, height: number, timeSec: number): Uint8Array {
  const out = new Uint8Array(rgba.length)
  const seed = Math.floor(timeSec * 30)
  for (let i = 0; i < rgba.length; i += 4) {
    const noise = (((i * 19937 + seed) % 31) - 15) * 0.5
    out[i] = clamp(Math.round(rgba[i] + noise), 0, 255)
    out[i + 1] = clamp(Math.round(rgba[i + 1] + noise), 0, 255)
    out[i + 2] = clamp(Math.round(rgba[i + 2] + noise), 0, 255)
    out[i + 3] = rgba[i + 3]
  }
  return out
}
