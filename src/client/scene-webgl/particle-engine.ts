/**
 * Continuous WebGL Particle Simulation Engine.
 */
import type { WebGlParticle } from './types.ts'

export class WebGlParticleEngine {
  private particles: WebGlParticle[] = []
  private maxParticles = 150
  private emitTimer = 0

  /**
   * Update particle simulation step.
   * @param dt Delta time in seconds
   * @param screenWidth Canvas width
   * @param screenHeight Canvas height
   */
  update(dt: number, screenWidth: number, screenHeight: number): void {
    // 1. Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
        continue
      }

      // Physics
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.vRot * dt

      // Fade in and out
      const progress = p.life / p.maxLife
      if (progress < 0.2) p.alpha = progress / 0.2
      else if (progress > 0.8) p.alpha = (1 - progress) / 0.2
      else p.alpha = 1
    }

    // 2. Emit new particles continuously
    this.emitTimer += dt
    const emitInterval = 0.05 // 20 particles / sec
    while (this.emitTimer >= emitInterval && this.particles.length < this.maxParticles) {
      this.emitTimer -= emitInterval
      this.spawnParticle(screenWidth, screenHeight)
    }
  }

  private spawnParticle(screenWidth: number, screenHeight: number): void {
    const startX = Math.random() * screenWidth
    const startY = Math.random() * screenHeight * 0.5 // spawn in upper/middle area

    this.particles.push({
      x: startX,
      y: startY,
      vx: (Math.random() - 0.5) * 40,
      vy: Math.random() * 50 + 30, // floating downwards
      life: 0,
      maxLife: Math.random() * 4 + 3,
      size: Math.random() * 20 + 10,
      alpha: 0,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 2,
      r: 1.0,
      g: 0.9,
      b: 0.95,
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
