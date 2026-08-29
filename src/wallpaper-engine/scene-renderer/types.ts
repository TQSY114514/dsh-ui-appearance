/**
 * Data structures and interfaces for the Wallpaper Engine Scene Rendering Engine.
 */

export interface SceneJson {
  objects?: SceneObjectJson[]
  camera?: SceneCameraJson
  general?: {
    clearcolor?: string
    clearenabled?: boolean
    ambientcolor?: string
    skylightcolor?: string
    bloom?: boolean
    bloomstrength?: number
    bloomthreshold?: number
    projection?: {
      width?: number
      height?: number
    }
  }
}

export interface SceneCameraJson {
  eye?: string
  center?: string
  up?: string
  fov?: number
  orthogonalprojection?: {
    width?: number
    height?: number
    auto?: boolean
  }
  parallax?: {
    amount?: number
    delay?: number
    mouse?: boolean
  }
}

export interface SceneObjectJson {
  id?: number
  name?: string
  type?: string
  image?: string
  model?: string
  particle?: string
  sound?: string
  text?: string
  camera?: string
  parent?: number
  attachment?: string
  origin?: string | number[]
  angles?: string | number[]
  scale?: string | number[]
  size?: string | number[]
  alignment?: string
  alpha?: number
  brightness?: number
  visible?: boolean | { user?: string; value?: boolean }
  color?: string
  effects?: SceneEffectJson[]
  animation?: SceneAnimationJson
  animationlayers?: SceneAnimationLayerJson[]
  parallaxDepth?: number | number[]
  autosize?: boolean
}

export interface SceneEffectJson {
  file?: string
  name?: string
  visible?: boolean
  passes?: ScenePassJson[]
}

export interface ScenePassJson {
  shader?: string
  textures?: string[]
  combos?: Record<string, string | number | boolean>
  constantvars?: Record<string, unknown>
}

export interface SceneAnimationJson {
  c0?: SceneKeyframeJson[]
  c1?: SceneKeyframeJson[]
  c2?: SceneKeyframeJson[]
  options?: {
    fps?: number
    length?: number
    mode?: string
  }
  relative?: boolean
}

export interface SceneKeyframeJson {
  frame: number
  value: number | string
  back?: { x: number; y: number }
  front?: { x: number; y: number }
}

export interface SceneAnimationLayerJson {
  animation?: number | string
  additive?: boolean
  blend?: number
  rate?: number
  visible?: boolean
}

export interface DecodedTexture {
  width: number
  height: number
  rgba: Uint8Array
  mime?: string
}

export interface SceneAccess {
  readJson: (path: string) => Record<string, unknown> | null
  readFile: (path: string) => { path: string; bytes: Uint8Array } | null
  readTexture: (path: string) => DecodedTexture | null
  listTexPaths: () => string[]
}

export interface RenderedFrame {
  width: number
  height: number
  rgba: Uint8Array
}
