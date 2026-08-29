/**
 * Matrix & Vector math, 32 Wallpaper Engine blend modes, and blitting utilities.
 */

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
export type Vec4 = [number, number, number, number]
/** Column-major 4x4 matrix (Float32Array of 16 elements). */
export type Mat4 = Float32Array

export function createMat4(): Mat4 {
  const out = new Float32Array(16)
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1
  return out
}

export function mat4Identity(out: Mat4): Mat4 {
  out.fill(0)
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1
  return out
}

export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  return out
}

export function mat4FromTRS(out: Mat4, origin: Vec3, angles: Vec3, scale: Vec3): Mat4 {
  mat4Identity(out)
  const radX = (angles[0] * Math.PI) / 180
  const radY = (angles[1] * Math.PI) / 180
  const radZ = (angles[2] * Math.PI) / 180

  const cx = Math.cos(-radX), sx = Math.sin(-radX)
  const cy = Math.cos(radY), sy = Math.sin(radY)
  const cz = Math.cos(-radZ), sz = Math.sin(-radZ)

  // Rotation: Rz(-z) * Ry(y) * Rx(-x)
  const r00 = (cz * cy) * scale[0]
  const r01 = (cz * sy * sx - sz * cx) * scale[1]
  const r02 = (cz * sy * cx + sz * sx) * scale[2]

  const r10 = (sz * cy) * scale[0]
  const r11 = (sz * sy * sx + cz * cx) * scale[1]
  const r12 = (sz * sy * cx - cz * sx) * scale[2]

  const r20 = (-sy) * scale[0]
  const r21 = (cy * sx) * scale[1]
  const r22 = (cy * cx) * scale[2]

  out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0
  out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0
  out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0
  out[12] = origin[0]; out[13] = origin[1]; out[14] = origin[2]; out[15] = 1
  return out
}

export function mat4Ortho(out: Mat4, left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  const lr = 1 / (left - right)
  const bt = 1 / (bottom - top)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = -2 * lr
  out[5] = -2 * bt
  out[10] = 2 * nf
  out[12] = (left + right) * lr
  out[13] = (top + bottom) * bt
  out[14] = (far + near) * nf
  out[15] = 1
  return out
}

export function parseVec3(raw: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(raw) && raw.length >= 3) {
    return [Number(raw[0]) || 0, Number(raw[1]) || 0, Number(raw[2]) || 0]
  }
  if (typeof raw === 'string') {
    const parts = raw.trim().split(/\s+/).map(Number)
    if (parts.length >= 3 && !parts.some(isNaN)) return [parts[0], parts[1], parts[2]]
    if (parts.length === 2 && !parts.some(isNaN)) return [parts[0], parts[1], fallback[2]]
    if (parts.length === 1 && !isNaN(parts[0])) return [parts[0], parts[0], parts[0]]
  }
  return [...fallback]
}

export function parseVec2(raw: unknown, fallback: Vec2 = [0, 0]): Vec2 {
  if (Array.isArray(raw) && raw.length >= 2) {
    return [Number(raw[0]) || 0, Number(raw[1]) || 0]
  }
  if (typeof raw === 'string') {
    const parts = raw.trim().split(/\s+/).map(Number)
    if (parts.length >= 2 && !parts.some(isNaN)) return [parts[0], parts[1]]
    if (parts.length === 1 && !isNaN(parts[0])) return [parts[0], parts[0]]
  }
  return [...fallback]
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Wallpaper Engine 32 standard ApplyBlending modes (0..31).
 * Mode 0: Normal (Source Over)
 * Mode 1: Additive
 * Mode 2: Multiply
 * Mode 3: Screen
 * Mode 4: Overlay
 * Mode 5: Darken
 * Mode 6: Lighten
 * Mode 7: Color Dodge
 * Mode 8: Color Burn
 * Mode 9: Hard Light
 * Mode 10: Soft Light
 * Mode 11: Difference
 * Mode 12: Exclusion
 * Mode 13: Hue
 * Mode 14: Saturation
 * Mode 15: Color
 * Mode 16: Luminosity
 * Mode 30: Tint Multiply (default tint)
 * Mode 31: Additive with Alpha
 */
export function blendPixel(
  dr: number, dg: number, db: number, da: number,
  sr: number, sg: number, sb: number, sa: number,
  mode = 0,
): [number, number, number, number] {
  const saF = sa / 255
  const daF = da / 255

  let outR = sr, outG = sg, outB = sb

  switch (mode) {
    case 1: // Additive
      outR = Math.min(255, dr + sr)
      outG = Math.min(255, dg + sg)
      outB = Math.min(255, db + sb)
      break
    case 2: // Multiply
    case 30: // Tint Multiply
      outR = (dr * sr) / 255
      outG = (dg * sg) / 255
      outB = (db * sb) / 255
      break
    case 3: // Screen
      outR = 255 - ((255 - dr) * (255 - sr)) / 255
      outG = 255 - ((255 - dg) * (255 - sg)) / 255
      outB = 255 - ((255 - db) * (255 - sb)) / 255
      break
    case 4: // Overlay
      outR = dr < 128 ? (2 * dr * sr) / 255 : 255 - (2 * (255 - dr) * (255 - sr)) / 255
      outG = dg < 128 ? (2 * dg * sg) / 255 : 255 - (2 * (255 - dg) * (255 - sg)) / 255
      outB = db < 128 ? (2 * db * sb) / 255 : 255 - (2 * (255 - db) * (255 - sb)) / 255
      break
    case 5: // Darken
      outR = Math.min(dr, sr)
      outG = Math.min(dg, sg)
      outB = Math.min(db, sb)
      break
    case 6: // Lighten
      outR = Math.max(dr, sr)
      outG = Math.max(dg, sg)
      outB = Math.max(db, sb)
      break
    default: // Normal
      outR = sr
      outG = sg
      outB = sb
      break
  }

  // Alpha compositing
  const outA = saF + daF * (1 - saF)
  if (outA <= 0) return [0, 0, 0, 0]
  const finalR = clamp(Math.round((outR * saF + dr * daF * (1 - saF)) / outA), 0, 255)
  const finalG = clamp(Math.round((outG * saF + dg * daF * (1 - saF)) / outA), 0, 255)
  const finalB = clamp(Math.round((outB * saF + db * daF * (1 - saF)) / outA), 0, 255)
  const finalA = clamp(Math.round(outA * 255), 0, 255)

  return [finalR, finalG, finalB, finalA]
}

/**
 * Blit a source RGBA sub-rect or layer onto destination canvas with bilinear scaling.
 */
export function blitLayer(
  dst: Uint8Array, dstW: number, dstH: number,
  src: Uint8Array, srcW: number, srcH: number,
  dx: number, dy: number, dw: number, dh: number,
  alpha = 1,
  blendMode = 0,
): void {
  if (alpha <= 0 || dw <= 0 || dh <= 0) return

  const x0 = Math.max(0, Math.floor(dx))
  const y0 = Math.max(0, Math.floor(dy))
  const x1 = Math.min(dstW, Math.ceil(dx + dw))
  const y1 = Math.min(dstH, Math.ceil(dy + dh))

  const scaleX = srcW / dw
  const scaleY = srcH / dh

  for (let y = y0; y < y1; y++) {
    const srcY = (y - dy) * scaleY
    const sy0 = Math.min(srcH - 1, Math.max(0, Math.floor(srcY)))
    const sy1 = Math.min(srcH - 1, sy0 + 1)
    const fy = srcY - sy0

    for (let x = x0; x < x1; x++) {
      const srcX = (x - dx) * scaleX
      const sx0 = Math.min(srcW - 1, Math.max(0, Math.floor(srcX)))
      const sx1 = Math.min(srcW - 1, sx0 + 1)
      const fx = srcX - sx0

      // Bilinear sample 4 pixels
      const idx00 = (sy0 * srcW + sx0) * 4
      const idx01 = (sy0 * srcW + sx1) * 4
      const idx10 = (sy1 * srcW + sx0) * 4
      const idx11 = (sy1 * srcW + sx1) * 4

      const w00 = (1 - fx) * (1 - fy)
      const w01 = fx * (1 - fy)
      const w10 = (1 - fx) * fy
      const w11 = fx * fy

      const sr = Math.round(src[idx00] * w00 + src[idx01] * w01 + src[idx10] * w10 + src[idx11] * w11)
      const sg = Math.round(src[idx00 + 1] * w00 + src[idx01 + 1] * w01 + src[idx10 + 1] * w10 + src[idx11 + 1] * w11)
      const sb = Math.round(src[idx00 + 2] * w00 + src[idx01 + 2] * w01 + src[idx10 + 2] * w10 + src[idx11 + 2] * w11)
      const rawSa = src[idx00 + 3] * w00 + src[idx01 + 3] * w01 + src[idx10 + 3] * w10 + src[idx11 + 3] * w11
      const sa = Math.round(rawSa * alpha)

      if (sa <= 0) continue

      const dstIdx = (y * dstW + x) * 4
      const [fr, fg, fb, fa] = blendPixel(
        dst[dstIdx], dst[dstIdx + 1], dst[dstIdx + 2], dst[dstIdx + 3],
        sr, sg, sb, sa,
        blendMode,
      )

      dst[dstIdx] = fr
      dst[dstIdx + 1] = fg
      dst[dstIdx + 2] = fb
      dst[dstIdx + 3] = fa
    }
  }
}
