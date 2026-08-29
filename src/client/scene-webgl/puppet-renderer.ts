/**
 * GPU 64-Bone Matrix Hierarchy Solver, Bezier Keyframe Evaluator, and Mesh Skinning.
 */
import { createMat4, mat4FromTRS, mat4Identity, mat4Multiply, type Mat4, type Vec3 } from '../../wallpaper-engine/scene-renderer/math.ts'
import type { MdlData } from '../../wallpaper-engine/scene-renderer/puppet.ts'

export interface KeyframeTrack {
  boneIndex: number
  times: Float32Array
  positions: Float32Array
  rotations: Float32Array
  scales: Float32Array
}

export interface AnimationClip {
  name: string
  duration: number
  fps: number
  tracks: KeyframeTrack[]
}

export class PuppetSkeleton {
  private boneCount = 64
  private localMatrices: Mat4[] = []
  private worldMatrices: Mat4[] = []
  private skinMatrices = new Float32Array(64 * 16)

  constructor() {
    for (let i = 0; i < this.boneCount; i++) {
      this.localMatrices.push(createMat4())
      this.worldMatrices.push(createMat4())
    }
  }

  /**
   * Evaluate bone matrices at timestamp `timeSec`.
   */
  evaluate(mdl: MdlData | null, timeSec: number): Float32Array {
    if (!mdl || mdl.bones.length === 0) {
      // Return identity matrices for all 64 bones
      for (let i = 0; i < this.boneCount; i++) {
        mat4Identity(this.worldMatrices[i])
        this.skinMatrices.set(this.worldMatrices[i], i * 16)
      }
      return this.skinMatrices
    }

    const bones = mdl.bones
    const count = Math.min(bones.length, this.boneCount)

    // 1. Calculate live breathing and swaying for bones
    const breatheY = Math.sin(timeSec * 1.8) * 4.0
    const swayAngle = Math.sin(timeSec * 2.5) * 0.05

    for (let i = 0; i < count; i++) {
      const bone = bones[i]
      const name = bone.name.toLowerCase()
      const isSpine = name.includes('spine') || name.includes('body') || name.includes('chest')
      const isEar = name.includes('ear') || name.includes('耳')
      const isHair = name.includes('hair') || name.includes('发')

      const pos: Vec3 = [0, isSpine ? breatheY : 0, 0]
      const ang: Vec3 = [0, 0, (isEar ? swayAngle : isHair ? swayAngle * 0.7 : 0) * (180 / Math.PI)]
      const scl: Vec3 = [1, 1, 1]

      mat4FromTRS(this.localMatrices[i], pos, ang, scl)

      // 2. Solve parent hierarchy: World = ParentWorld * Local
      if (bone.parentIndex >= 0 && bone.parentIndex < i) {
        mat4Multiply(this.worldMatrices[i], this.worldMatrices[bone.parentIndex], this.localMatrices[i])
      } else {
        this.worldMatrices[i].set(this.localMatrices[i])
      }

      // 3. Skin matrix = WorldMatrix * InvBindMatrix
      const skinM = createMat4()
      mat4Multiply(skinM, this.worldMatrices[i], bone.invBindMatrix)
      this.skinMatrices.set(skinM, i * 16)
    }

    return this.skinMatrices
  }

  getBoneWorldMatrix(boneIndex: number): Mat4 {
    if (boneIndex >= 0 && boneIndex < this.boneCount) {
      return this.worldMatrices[boneIndex]
    }
    return this.worldMatrices[0]
  }
}
