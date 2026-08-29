/**
 * 60 FPS WebGL Scene Runtime Player for browser background.
 */
import { createGlContext, createProgram, createQuadBuffer, createTextureFromImage } from './gl-util.ts'
import { WebGlParticleEngine } from './particle-engine.ts'
import { computePuppetMotion } from './puppet-renderer.ts'
import { BASE_FRAGMENT_SHADER, BASE_VERTEX_SHADER, FILMGRAIN_FRAGMENT_SHADER, PULSE_FRAGMENT_SHADER, WATERWAVES_FRAGMENT_SHADER } from './shaders.ts'
import type { WebGlSceneLayer } from './types.ts'

export class WebGlSceneRuntime {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null
  private baseProgram: WebGLProgram | null = null
  private wavesProgram: WebGLProgram | null = null
  private pulseProgram: WebGLProgram | null = null
  private grainProgram: WebGLProgram | null = null
  private quadBuffer: WebGLBuffer | null = null

  private particleEngine = new WebGlParticleEngine()
  private layers: WebGlSceneLayer[] = []
  private isRunning = false
  private animFrameId = 0
  private lastTime = 0
  private startTime = 0

  private mouseX = 0.5
  private mouseY = 0.5
  private onMouseMove: ((e: MouseEvent) => void) | null = null
  private onVisibilityChange: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'dsw-scene-canvas'
    this.canvas.style.position = 'absolute'
    this.canvas.style.inset = '0'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.style.zIndex = '0'
    container.appendChild(this.canvas)

    this.initGl()
    this.initEvents()
  }

  private initGl(): void {
    this.gl = createGlContext(this.canvas)
    if (!this.gl) return

    const gl = this.gl
    this.baseProgram = createProgram(gl, BASE_VERTEX_SHADER, BASE_FRAGMENT_SHADER)
    this.wavesProgram = createProgram(gl, BASE_VERTEX_SHADER, WATERWAVES_FRAGMENT_SHADER)
    this.pulseProgram = createProgram(gl, BASE_VERTEX_SHADER, PULSE_FRAGMENT_SHADER)
    this.grainProgram = createProgram(gl, BASE_VERTEX_SHADER, FILMGRAIN_FRAGMENT_SHADER)
    this.quadBuffer = createQuadBuffer(gl)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  private initEvents(): void {
    this.onMouseMove = (e: MouseEvent): void => {
      this.mouseX = e.clientX / window.innerWidth
      this.mouseY = e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', this.onMouseMove, { passive: true })

    this.onVisibilityChange = (): void => {
      if (document.hidden) {
        this.stop()
      } else {
        this.start()
      }
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  loadLayers(layers: WebGlSceneLayer[]): void {
    this.layers = layers
    if (this.gl) {
      for (const layer of this.layers) {
        if (layer.textureUrl && !layer.texture) {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = (): void => {
            if (this.gl) layer.texture = createTextureFromImage(this.gl, img)
          }
          img.src = layer.textureUrl
        }
      }
    }
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.startTime = performance.now() * 0.001
    this.lastTime = this.startTime

    const loop = (nowMs: number): void => {
      if (!this.isRunning) return
      const now = nowMs * 0.001
      const dt = Math.min(0.1, now - this.lastTime)
      this.lastTime = now

      this.renderFrame(now - this.startTime, dt)
      this.animFrameId = requestAnimationFrame(loop)
    }

    this.animFrameId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.isRunning = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = 0
    }
  }

  private renderFrame(time: number, dt: number): void {
    const gl = this.gl
    if (!gl) return

    // Resize canvas if needed
    const dpr = window.devicePixelRatio || 1
    const w = Math.floor(this.canvas.clientWidth * dpr)
    const h = Math.floor(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      gl.viewport(0, 0, w, h)
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const motion = computePuppetMotion(time)
    this.particleEngine.update(dt, w, h)

    // Render layers
    for (const layer of this.layers) {
      if (!layer.visible || !layer.texture) continue
      // Calculate dynamic offset (breathing & sway)
      const isEar = layer.name?.toLowerCase().includes('ear') || layer.name?.toLowerCase().includes('耳')
      const isHair = layer.name?.toLowerCase().includes('hair') || layer.name?.toLowerCase().includes('发')

      let dy = motion.breatheOffset
      let rot = layer.rotation
      if (isEar) rot += motion.earSwayAngle
      if (isHair) rot += motion.hairSwayAngle

      // Mouse parallax shift
      const px = (this.mouseX - 0.5) * 15
      const py = (this.mouseY - 0.5) * 15

      this.drawQuad(layer.texture, layer.x + px, layer.y + dy + py, layer.width, layer.height, rot, layer.alpha)
    }
  }

  private drawQuad(
    texture: WebGLTexture,
    x: number, y: number,
    width: number, height: number,
    rotation: number,
    alpha: number,
  ): void {
    const gl = this.gl
    if (!gl || !this.baseProgram || !this.quadBuffer) return

    gl.useProgram(this.baseProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)

    const aPos = gl.getAttribLocation(this.baseProgram, 'a_position')
    const aTex = gl.getAttribLocation(this.baseProgram, 'a_texCoord')

    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)

    gl.enableVertexAttribArray(aTex)
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8)

    const uRes = gl.getUniformLocation(this.baseProgram, 'u_resolution')
    gl.uniform2f(uRes, this.canvas.width, this.canvas.height)

    const uAlpha = gl.getUniformLocation(this.baseProgram, 'u_alpha')
    gl.uniform1f(uAlpha, alpha)

    const uTint = gl.getUniformLocation(this.baseProgram, 'u_tint')
    gl.uniform3f(uTint, 1.0, 1.0, 1.0)

    // Build 2D transform matrix
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const matrix = [
      width * cos, width * sin, 0,
      -height * sin, height * cos, 0,
      x, y, 1,
    ]
    const uMat = gl.getUniformLocation(this.baseProgram, 'u_matrix')
    gl.uniformMatrix3fv(uMat, false, matrix)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  dispose(): void {
    this.stop()
    if (this.onMouseMove) {
      window.removeEventListener('mousemove', this.onMouseMove)
      this.onMouseMove = null
    }
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
      this.onVisibilityChange = null
    }
    this.canvas.remove()
    this.layers = []
  }
}
