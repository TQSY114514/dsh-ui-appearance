/**
 * Client WebGL 2.0 Scene Engine types and data structures.
 */

export interface WebGlSceneLayer {
  id: number
  name?: string
  textureUrl?: string
  texture?: WebGLTexture | null
  width: number
  height: number
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  alpha: number
  visible: boolean
  effects?: string[]
  isParticle?: boolean
}

export interface WebGlParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  alpha: number
  rotation: number
  vRot: number
  r: number
  g: number
  b: number
}

export interface WebGlShaderEffect {
  program: WebGLProgram
  attribLocations: Record<string, number>
  uniformLocations: Record<string, WebGLUniformLocation | null>
}
