/**
 * Scene Camera system for Wallpaper Engine Scene Renderer.
 */
import { createMat4, mat4Identity, mat4Multiply, mat4Ortho, parseVec3, type Mat4, type Vec3 } from './math.ts'
import type { SceneCameraJson, SceneJson } from './types.ts'

export interface CameraState {
  viewMatrix: Mat4
  projMatrix: Mat4
  viewProjMatrix: Mat4
  eye: Vec3
  center: Vec3
  up: Vec3
  isOrtho: boolean
  width: number
  height: number
}

/**
 * Build camera projection and view matrix according to Wallpaper Engine conventions.
 */
export function setupSceneCamera(scene: SceneJson, targetWidth: number, targetHeight: number): CameraState {
  const general = scene.general
  const cam = scene.camera

  const projW = general?.projection?.width || cam?.orthogonalprojection?.width || targetWidth
  const projH = general?.projection?.height || cam?.orthogonalprojection?.height || targetHeight

  const eye = parseVec3(cam?.eye, [0, 0, 1000])
  const center = parseVec3(cam?.center, [0, 0, 0])
  const up = parseVec3(cam?.up, [0, 1, 0])

  const viewMatrix = createMat4()
  const projMatrix = createMat4()
  const viewProjMatrix = createMat4()

  // Orthogonal projection: [-projW/2, projW/2, -projH/2, projH/2, 0.1, 10000]
  mat4Ortho(projMatrix, -projW / 2, projW / 2, -projH / 2, projH / 2, -10000, 10000)

  // Simple look-at view matrix
  mat4Identity(viewMatrix)
  viewMatrix[12] = -eye[0]
  viewMatrix[13] = -eye[1]
  viewMatrix[14] = -eye[2]

  mat4Multiply(viewProjMatrix, projMatrix, viewMatrix)

  return {
    viewMatrix,
    projMatrix,
    viewProjMatrix,
    eye,
    center,
    up,
    isOrtho: true,
    width: projW,
    height: projH,
  }
}
