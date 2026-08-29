/**
 * 1:1 Heavy WebGL Scene Runtime Player with multi-layer streaming,
 * aspect-correct vertical blur-extend, live particles, and puppet limb animation.
 */
import { createFramebuffer, createGlContext, createProgram, createQuadBuffer, createTextureFromImage, type FramebufferObject } from './gl-util.ts'
import { WebGlParticleEngine } from './particle-engine.ts'
import { PuppetSkeleton } from './puppet-renderer.ts'
import {
  BASE_FRAGMENT_SHADER,
  BASE_VERTEX_SHADER,
  BLOOM_COMBINE_FRAGMENT_SHADER,
  BLOOM_EXTRACT_FRAGMENT_SHADER,
  BLUR_FRAGMENT_SHADER,
  FILMGRAIN_FRAGMENT_SHADER,
  FOLIAGESWAY_VERTEX_SHADER,
  GLITTER_FRAGMENT_SHADER,
  GODRAYS_FRAGMENT_SHADER,
  PULSE_FRAGMENT_SHADER,
  SHIMMER_FRAGMENT_SHADER,
  WATERCAUSTICS_FRAGMENT_SHADER,
  WATERFLOW_FRAGMENT_SHADER,
  WATERWAVES_FRAGMENT_SHADER,
} from './shaders.ts'
import type { WebGlSceneLayer } from './types.ts'

function createParticleGlowTexture(gl: WebGLRenderingContext | WebGL2RenderingContext): WebGLTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const radGrad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  radGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
  radGrad.addColorStop(0.3, 'rgba(255, 220, 240, 0.85)')
  radGrad.addColorStop(0.7, 'rgba(255, 180, 220, 0.25)')
  radGrad.addColorStop(1, 'rgba(255, 180, 220, 0.0)')

  ctx.fillStyle = radGrad
  ctx.fillRect(0, 0, 64, 64)

  return createTextureFromImage(gl, canvas)
}

export class WebGlSceneRuntime {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null

  // Shader Programs
  private baseProgram: WebGLProgram | null = null
  private wavesProgram: WebGLProgram | null = null
  private pulseProgram: WebGLProgram | null = null
  private grainProgram: WebGLProgram | null = null
  private shimmerProgram: WebGLProgram | null = null
  private glitterProgram: WebGLProgram | null = null
  private causticsProgram: WebGLProgram | null = null
  private swayProgram: WebGLProgram | null = null
  private godraysProgram: WebGLProgram | null = null
  private blurProgram: WebGLProgram | null = null
  private bloomExtractProgram: WebGLProgram | null = null
  private bloomCombineProgram: WebGLProgram | null = null

  private quadBuffer: WebGLBuffer | null = null
  private particleTexture: WebGLTexture | null = null

  private particleEngine = new WebGlParticleEngine()
  private skeleton = new PuppetSkeleton()
  private layers: WebGlSceneLayer[] = []
  private isRunning = false
  private animFrameId = 0
  private lastTime = 0
  private startTime = 0

  private mouseX = 0.5
  private mouseY = 0.5
  private targetMouseX = 0.5
  private targetMouseY = 0.5
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
    this.shimmerProgram = createProgram(gl, BASE_VERTEX_SHADER, SHIMMER_FRAGMENT_SHADER)
    this.glitterProgram = createProgram(gl, BASE_VERTEX_SHADER, GLITTER_FRAGMENT_SHADER)
    this.causticsProgram = createProgram(gl, BASE_VERTEX_SHADER, WATERCAUSTICS_FRAGMENT_SHADER)
    this.swayProgram = createProgram(gl, FOLIAGESWAY_VERTEX_SHADER, BASE_FRAGMENT_SHADER)
    this.godraysProgram = createProgram(gl, BASE_VERTEX_SHADER, GODRAYS_FRAGMENT_SHADER)
    this.blurProgram = createProgram(gl, BASE_VERTEX_SHADER, BLUR_FRAGMENT_SHADER)
    this.bloomExtractProgram = createProgram(gl, BASE_VERTEX_SHADER, BLOOM_EXTRACT_FRAGMENT_SHADER)
    this.bloomCombineProgram = createProgram(gl, BASE_VERTEX_SHADER, BLOOM_COMBINE_FRAGMENT_SHADER)

    this.quadBuffer = createQuadBuffer(gl)
    this.particleTexture = createParticleGlowTexture(gl)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  private initEvents(): void {
    this.onMouseMove = (e: MouseEvent): void => {
      this.targetMouseX = e.clientX / window.innerWidth
      this.targetMouseY = e.clientY / window.innerHeight
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
            if (this.gl) {
              layer.texture = createTextureFromImage(this.gl, img)
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                layer.width = img.naturalWidth
                layer.height = img.naturalHeight
              }
            }
          }
          img.src = layer.textureUrl
        }
      }
    }
  }

  /**
   * Load full multi-layer scene structure from parsed scene.json.
   */
  loadSceneData(targetPath: string, sceneJson: any): void {
    if (!sceneJson?.objects || !Array.isArray(sceneJson.objects)) return

    const newLayers: WebGlSceneLayer[] = []
    const screenW = window.innerWidth || 1920
    const screenH = window.innerHeight || 1080
    const projW = sceneJson.general?.projection?.width || screenW
    const projH = sceneJson.general?.projection?.height || screenH

    let layerId = 1
    for (const obj of sceneJson.objects) {
      if (obj.visible === false) continue
      const name = obj.name || `layer_${layerId}`

      // Resolve texture entry name
      let entry = ''
      if (obj.image) entry = obj.image
      else if (obj.model) entry = obj.model
      else if (obj.material) entry = obj.material

      if (!entry && typeof obj.text === 'string') continue
      if (!entry) entry = `${name}.tex`

      const textureUrl = `/api/ui-appearance/wallpaper-engine/layer-texture?path=${encodeURIComponent(targetPath)}&entry=${encodeURIComponent(entry)}`

      // Transform calculation
      const ox = (obj.origin?.[0] ?? projW * 0.5) * (screenW / projW)
      const oy = (obj.origin?.[1] ?? projH * 0.5) * (screenH / projH)
      const scaleX = obj.scale?.[0] ?? 1
      const scaleY = obj.scale?.[1] ?? 1
      const rotation = ((obj.angles?.[2] ?? 0) * Math.PI) / 180

      newLayers.push({
        id: layerId++,
        name,
        textureUrl,
        width: screenW * scaleX,
        height: screenH * scaleY,
        x: ox,
        y: oy,
        scaleX,
        scaleY,
        rotation,
        alpha: obj.alpha ?? 1.0,
        visible: true,
      })
    }

    if (newLayers.length > 0) {
      this.loadLayers(newLayers)
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

    // Smooth spring mouse parallax damping
    this.mouseX += (this.targetMouseX - this.mouseX) * Math.min(1, dt * 8)
    this.mouseY += (this.targetMouseY - this.mouseY) * Math.min(1, dt * 8)

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

    // 1. Evaluate bone skeleton matrices
    this.skeleton.evaluate(null, time)

    // 2. Update particle simulation
    this.particleEngine.update(dt, w, h)

    // 3. Harmonic motion curves for character limbs
    const breatheOffset = Math.sin(time * 1.8) * 6.0
    const earTwitch = Math.sin(time * 3.2) * 0.05 + Math.sin(time * 6.5) * 0.025
    const hairSway = Math.sin(time * 1.6 + 0.4) * 0.035

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    for (const layer of this.layers) {
      if (!layer.visible || !layer.texture) continue

      const name = (layer.name || '').toLowerCase()
      const isEar = name.includes('ear') || name.includes('耳')
      const isHair = name.includes('hair') || name.includes('发')
      const isBody = name.includes('body') || name.includes('spine') || name.includes('chest') || name.includes('身')
      const isFace = name.includes('face') || name.includes('eye') || name.includes('脸') || name.includes('头') || name.includes('head')
      const isWater = name.includes('water') || name.includes('水')

      // Check aspect ratio for vertical layout (blur-extend)
      const isPortrait = layer.width > 0 && layer.height > 0 && (layer.width / layer.height) < 1.25

      let dy = isBody || isFace || isEar || isHair ? breatheOffset : 0
      let rot = layer.rotation
      if (isEar) rot += earTwitch
      if (isHair) rot += hairSway

      // Mouse 3D depth parallax
      const depthWeight = isEar || isHair ? 1.4 : isFace ? 1.2 : isBody ? 1.0 : 0.4
      const px = (this.mouseX - 0.5) * 22 * depthWeight
      const py = (this.mouseY - 0.5) * 22 * depthWeight

      // Select shader program
      let prog = this.baseProgram
      if (isWater && this.wavesProgram) prog = this.wavesProgram

      if (isPortrait && this.layers.length === 1) {
        // Vertical wallpaper dual-layer rendering:
        // 1. Blurred background stretched to fill screen
        this.drawLayerQuad(this.blurProgram || prog, layer.texture, w * 0.5, h * 0.5, w * 1.2, h * 1.2, 0, 0.85, time)

        // 2. Crisp foreground centered with preserved aspect ratio
        const aspect = layer.width / layer.height
        const fgH = h
        const fgW = h * aspect
        this.drawLayerQuad(prog, layer.texture, w * 0.5 + px, h * 0.5 + py + dy, fgW, fgH, rot, layer.alpha, time)
      } else {
        // Multi-layer scene element rendering
        const drawW = layer.width > 0 && layer.width <= w ? layer.width : w
        const drawH = layer.height > 0 && layer.height <= h ? layer.height : h
        this.drawLayerQuad(prog, layer.texture, layer.x + px, layer.y + dy + py, drawW, drawH, rot, layer.alpha, time)
      }
    }

    // 4. Render glowing particles on top
    this.drawParticles(time)
  }

  private drawParticles(time: number): void {
    const gl = this.gl
    if (!gl || !this.particleTexture || !this.baseProgram) return

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE) // Additive glowing particles

    const particles = this.particleEngine.getParticles()
    for (const p of particles) {
      if (p.alpha <= 0.001) continue
      this.drawLayerQuad(
        this.baseProgram,
        this.particleTexture,
        p.x,
        p.y,
        p.size,
        p.size,
        p.rotation,
        p.alpha,
        time,
        [p.r, p.g, p.b],
      )
    }
  }

  private drawLayerQuad(
    prog: WebGLProgram | null,
    texture: WebGLTexture,
    x: number, y: number,
    width: number, height: number,
    rotation: number,
    alpha: number,
    time: number,
    tint: [number, number, number] = [1.0, 1.0, 1.0],
  ): void {
    const gl = this.gl
    if (!gl || !prog || !this.quadBuffer) return

    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)

    const aPos = gl.getAttribLocation(prog, 'a_position')
    const aTex = gl.getAttribLocation(prog, 'a_texCoord')

    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    }
    if (aTex >= 0) {
      gl.enableVertexAttribArray(aTex)
      gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8)
    }

    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    if (uRes) gl.uniform2f(uRes, this.canvas.width, this.canvas.height)

    const uAlpha = gl.getUniformLocation(prog, 'u_alpha')
    if (uAlpha) gl.uniform1f(uAlpha, alpha)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    if (uTime) gl.uniform1f(uTime, time)

    const uStrength = gl.getUniformLocation(prog, 'u_strength')
    if (uStrength) gl.uniform1f(uStrength, 1.0)

    const uFreq = gl.getUniformLocation(prog, 'u_frequency')
    if (uFreq) gl.uniform1f(uFreq, 8.0)

    const uSpeed = gl.getUniformLocation(prog, 'u_speed')
    if (uSpeed) gl.uniform1f(uSpeed, 2.0)

    const uTint = gl.getUniformLocation(prog, 'u_tint')
    if (uTint) gl.uniform3f(uTint, tint[0], tint[1], tint[2])

    // 2D Affine Transformation Matrix
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const matrix = [
      width * cos, width * sin, 0,
      -height * sin, height * cos, 0,
      x, y, 1,
    ]
    const uMat = gl.getUniformLocation(prog, 'u_matrix')
    if (uMat) gl.uniformMatrix3fv(uMat, false, matrix)

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
