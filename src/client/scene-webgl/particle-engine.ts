/**
 * Professional multi-emitter particle dynamics engine for WebGL Scene Renderer.
 * Supports BoxRandom, SphereRandom, Gravity fields, Drag, Color Gradients, and Sprites.
 */
import type { WebGlParticle } from './types.ts'

export type EmitterType = 'box' | 'sphere' | 'point' | 'line'

export interface EmitterConfig {
  type: EmitterType
  rate: number
  extent: [number, number, number]
  distMin: number
  distMax: number
  speedMin: number
  speedMax: number
  sizeMin: number
  sizeMax: number
  lifeMin: number
  lifeMax: number
  gravity: [number, number]
  drag: number
  color1: [number, number, number]
  color2: [number, number, number]
}

export class WebGlParticleEngine {
  private particles: WebGlParticle[] = []
  private maxParticles = 300
  private emitTimer = 0

  private config: EmitterConfig = {
    type: 'box',
    rate: 35,
    extent: [1920, 200, 0],
    distMin: 0,
    distMax: 300,
    speedMin: 20,
    speedMax: 60,
    sizeMin: 12,
    sizeMax: 32,
    lifeMin: 3.5,
    lifeMax: 7.0,
    gravity: [5, 45], // gentle downwards drift + wind
    drag: 0.98,
    color1: [1.0, 0.95, 0.9],
    color2: [0.9, 0.7, 0.85], // cherry blossom / sunset pink tint
  }

  setEmitterConfig(partial: Partial<EmitterConfig>): void {
    Object.assign(this.config, partial)
  }

  /**
   * Update particle simulation step with Euler integration.
   */
  update(dt: number, screenWidth: number, screenHeight: number): void {
    const cfg = this.config

    // 1. Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
        continue
      }

      // Physics integration: Velocity += Gravity * dt, Position += Velocity * dt
      p.vx = (p.vx + cfg.gravity[0] * dt) * Math.pow(cfg.drag, dt * 60)
      p.vy = (p.vy + cfg.gravity[1] * dt) * Math.pow(cfg.drag, dt * 60)

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.vRot * dt

      // Color gradient interpolation over lifetime
      const progress = p.life / p.maxLife
      p.r = cfg.color1[0] + (cfg.color2[0] - cfg.color1[0]) * progress
      p.g = cfg.color1[1] + (cfg.color2[1] - cfg.color1[1]) * progress
      p.b = cfg.color1[2] + (cfg.color2[2] - cfg.color1[2]) * progress

      // Alpha smooth fade in (0..0.15) and fade out (0.85..1.0)
      if (progress < 0.15) {
        p.alpha = progress / 0.15
      } else if (progress > 0.85) {
        p.alpha = (1.0 - progress) / 0.15
      } else {
        p.alpha = 1.0
      }
    }

    // 2. Continuously spawn new particles based on rate
    this.emitTimer += dt
    const emitInterval = 1.0 / Math.max(1, cfg.rate)
    while (this.emitTimer >= emitInterval && this.particles.length < this.maxParticles) {
      this.emitTimer -= emitInterval
      this.spawnParticle(screenWidth, screenHeight)
    }
  }

  private spawnParticle(screenWidth: number, screenHeight: number): void {
    const cfg = this.config
    let startX = 0
    let startY = 0

    if (cfg.type === 'sphere') {
      const angle = Math.random() * Math.PI * 2
      const r = cfg.distMin + Math.random() * (cfg.distMax - cfg.distMin)
      startX = screenWidth * 0.5 + Math.cos(angle) * r
      startY = screenHeight * 0.5 + Math.sin(angle) * r
    } else {
      // Box emitter (across top width)
      startX = (Math.random() - 0.5) * cfg.extent[0] + screenWidth * 0.5
      startY = Math.random() * cfg.extent[1] - 50 // slightly above screen
    }

    const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin)
    const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 0.8 // downwards cone

    this.particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: cfg.lifeMin + Math.random() * (cfg.lifeMax - cfg.lifeMin),
      size: cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin),
      alpha: 0,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 2.5,
      r: cfg.color1[0],
      g: cfg.color1[1],
      b: cfg.color1[2],
    })
  }

  getParticles(): readonly WebGlParticle[] {
    return this.particles
  }

  clear(): void {
    this.particles = []
    this.emitTimer = 0
  }
}
