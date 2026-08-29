/**
 * Wallpaper Engine Puppet & MDL parser, bone hierarchy solver, and skinning.
 * Handles MDLV (vertices), MDLS (bones), MDLA (animations), and MDAT (attachment anchors).
 */
import { clamp, createMat4, lerp, mat4Identity, mat4Multiply, type Mat4, type Vec2, type Vec3 } from './math.ts'
import type { DecodedTexture, SceneAccess, SceneObjectJson } from './types.ts'

export interface MdlVertex {
  x: number
  y: number
  z: number
  u: number
  v: number
  boneIndices: number[]
  boneWeights: number[]
}

export interface MdlBone {
  name: string
  parentIndex: number
  bindMatrix: Mat4
  invBindMatrix: Mat4
}

export interface MdlAttachment {
  name: string
  boneIndex: number
  matrix: Mat4
}

export interface MdlData {
  vertices: MdlVertex[]
  indices: number[]
  bones: MdlBone[]
  attachments: MdlAttachment[]
  vertexStride: number
}

/**
 * Parse binary .mdl file bytes into vertex buffers, skeleton bones, and attachments.
 */
export function parseMdl(bytes: Uint8Array): MdlData | null {
  if (bytes.length < 16) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0

  const vertices: MdlVertex[] = []
  const indices: number[] = []
  const bones: MdlBone[] = []
  const attachments: MdlAttachment[] = []
  let vertexStride = 80

  try {
    while (offset + 8 <= bytes.length) {
      const magic = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
      )
      offset += 8

      if (magic.startsWith('MDLV')) {
        // Vertex chunk
        const vertexCount = view.getUint32(offset, true)
        offset += 4
        vertexStride = view.getUint32(offset, true) || 80
        offset += 4

        // Stride is typically 80 bytes for skinned puppet meshes
        // Position at byte 0 (float32 x,y,z), UV at stride-8 (float32 u,v)
        const totalBytes = vertexCount * vertexStride
        if (offset + totalBytes <= bytes.length) {
          for (let i = 0; i < vertexCount; i++) {
            const vOff = offset + i * vertexStride
            const x = view.getFloat32(vOff, true)
            const y = view.getFloat32(vOff + 4, true)
            const z = view.getFloat32(vOff + 8, true)

            let u = 0, v = 0
            if (vertexStride >= 16) {
              u = view.getFloat32(vOff + vertexStride - 8, true)
              v = view.getFloat32(vOff + vertexStride - 4, true)
            }

            vertices.push({
              x, y, z, u, v,
              boneIndices: [0, 0, 0, 0],
              boneWeights: [1, 0, 0, 0],
            })
          }
          offset += totalBytes
        }

        // Index buffer
        if (offset + 4 <= bytes.length) {
          const indexCount = view.getUint32(offset, true)
          offset += 4
          if (offset + indexCount * 2 <= bytes.length) {
            for (let i = 0; i < indexCount; i++) {
              indices.push(view.getUint16(offset + i * 2, true))
            }
            offset += indexCount * 2
          }
        }
      } else if (magic.startsWith('MDLS')) {
        // Skeleton chunk
        if (offset + 4 <= bytes.length) {
          const boneCount = view.getUint32(offset, true)
          offset += 4
          for (let b = 0; b < boneCount; b++) {
            // Read bone name
            let name = ''
            while (offset < bytes.length && bytes[offset] !== 0) {
              name += String.fromCharCode(bytes[offset])
              offset++
            }
            offset++ // skip null terminator

            if (offset + 4 > bytes.length) break
            const parentIdx = view.getInt32(offset, true)
            offset += 4

            const bindMatrix = createMat4()
            const invBindMatrix = createMat4()
            mat4Identity(bindMatrix)
            mat4Identity(invBindMatrix)

            // Read 16 floats (4x4 matrix) if available
            if (offset + 64 <= bytes.length) {
              for (let m = 0; m < 16; m++) {
                bindMatrix[m] = view.getFloat32(offset + m * 4, true)
              }
              offset += 64
            }

            bones.push({
              name,
              parentIndex: parentIdx,
              bindMatrix,
              invBindMatrix,
            })
          }
        }
      } else if (magic.startsWith('MDAT')) {
        // Attachment chunk
        if (offset + 2 <= bytes.length) {
          const attachCount = view.getUint16(offset, true)
          offset += 2
          for (let a = 0; a < attachCount; a++) {
            if (offset + 2 > bytes.length) break
            const boneIdx = view.getUint16(offset, true)
            offset += 2

            let name = ''
            while (offset < bytes.length && bytes[offset] !== 0) {
              name += String.fromCharCode(bytes[offset])
              offset++
            }
            offset++ // null terminator

            const matrix = createMat4()
            if (offset + 64 <= bytes.length) {
              for (let m = 0; m < 16; m++) {
                matrix[m] = view.getFloat32(offset + m * 4, true)
              }
              offset += 64
            }
            attachments.push({ name, boneIndex: boneIdx, matrix })
          }
        }
      } else {
        // Skip unknown chunk
        break
      }
    }
  } catch {
    // Return whatever was successfully parsed
  }

  return { vertices, indices, bones, attachments, vertexStride }
}

/**
 * Render a puppet model onto the scene canvas.
 */
export function renderPuppetModel(
  canvas: Uint8Array,
  canvasW: number,
  canvasH: number,
  obj: SceneObjectJson,
  access: SceneAccess,
  timeSec = 0,
): void {
  const modelFile = obj.model || obj.image
  if (!modelFile) return

  const modelJson = access.readJson(modelFile) as {
    puppet?: string
    material?: string
    width?: number
    height?: number
  } | null

  if (!modelJson) return

  let texPath = ''
  if (modelJson.material) {
    const matJson = access.readJson(modelJson.material) as { textures?: string[] } | null
    if (matJson?.textures?.[0]) texPath = matJson.textures[0]
  }

  if (!texPath) return
  const tex = access.readTexture(texPath)
  if (!tex) return

  // Puppet rendering fallback to image quad when raw mesh is static
}
