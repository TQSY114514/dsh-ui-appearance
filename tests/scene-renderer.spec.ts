import { describe, expect, it } from 'vitest'
import {
  blendPixel,
  blitLayer,
  createMat4,
  mat4FromTRS,
  mat4Multiply,
  mat4Ortho,
  parseVec3,
} from '../src/wallpaper-engine/scene-renderer/math.ts'
import { setupSceneCamera } from '../src/wallpaper-engine/scene-renderer/camera.ts'
import { renderScene } from '../src/wallpaper-engine/scene-renderer/scene-engine.ts'

describe('scene-renderer: math', () => {
  it('creates identity matrix', () => {
    const m = createMat4()
    expect(m[0]).toBe(1)
    expect(m[5]).toBe(1)
    expect(m[10]).toBe(1)
    expect(m[15]).toBe(1)
    expect(m[1]).toBe(0)
  })

  it('mat4FromTRS correctly places translation', () => {
    const m = createMat4()
    mat4FromTRS(m, [100, 200, 300], [0, 0, 0], [1, 1, 1])
    expect(m[12]).toBe(100)
    expect(m[13]).toBe(200)
    expect(m[14]).toBe(300)
  })

  it('mat4Ortho creates valid orthogonal projection', () => {
    const m = createMat4()
    mat4Ortho(m, -960, 960, -540, 540, -1000, 1000)
    expect(m[0]).toBeCloseTo(2 / 1920)
    expect(m[5]).toBeCloseTo(2 / 1080)
    expect(m[15]).toBe(1)
  })

  it('blendPixel handles normal and additive blending', () => {
    // Normal: full opacity source replaces destination
    const [r, g, b, a] = blendPixel(100, 100, 100, 255, 200, 50, 50, 255, 0)
    expect(r).toBe(200)
    expect(g).toBe(50)
    expect(b).toBe(50)
    expect(a).toBe(255)

    // Additive: colors add up
    const [ar, ag, ab] = blendPixel(100, 100, 100, 255, 50, 50, 50, 255, 1)
    expect(ar).toBe(150)
    expect(ag).toBe(150)
    expect(ab).toBe(150)
  })
})

describe('scene-renderer: camera and engine', () => {
  it('setupSceneCamera uses scene projection size', () => {
    const cam = setupSceneCamera(
      {
        general: { projection: { width: 1920, height: 1080 } },
        camera: { eye: '0 0 1000' },
      },
      1920,
      1080,
    )
    expect(cam.width).toBe(1920)
    expect(cam.height).toBe(1080)
    expect(cam.eye[2]).toBe(1000)
  })

  it('renderScene composites background clear color and empty scene', () => {
    const mockAccess = {
      readJson: () => null,
      readFile: () => null,
      readTexture: () => null,
      listTexPaths: () => [],
    }
    const frame = renderScene(
      {
        general: {
          clearcolor: '0.5 0.5 0.5',
          clearenabled: true,
          projection: { width: 100, height: 100 },
        },
        objects: [],
      },
      mockAccess,
      { targetWidth: 100, targetHeight: 100 },
    )
    expect(frame.width).toBe(100)
    expect(frame.height).toBe(100)
    expect(frame.rgba[0]).toBe(128)
    expect(frame.rgba[1]).toBe(128)
    expect(frame.rgba[2]).toBe(128)
    expect(frame.rgba[3]).toBe(255)
  })
})
