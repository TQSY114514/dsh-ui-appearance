// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { WebGlParticleEngine } from '../src/client/scene-webgl/particle-engine.ts'
import { computePuppetMotion } from '../src/client/scene-webgl/puppet-renderer.ts'
import {
  BASE_FRAGMENT_SHADER,
  BASE_VERTEX_SHADER,
  FILMGRAIN_FRAGMENT_SHADER,
  PULSE_FRAGMENT_SHADER,
  WATERWAVES_FRAGMENT_SHADER,
} from '../src/client/scene-webgl/shaders.ts'

describe('scene-webgl: shaders', () => {
  it('defines valid vertex and fragment shader sources', () => {
    expect(BASE_VERTEX_SHADER).toContain('a_position')
    expect(BASE_VERTEX_SHADER).toContain('a_texCoord')
    expect(BASE_FRAGMENT_SHADER).toContain('u_image')
    expect(WATERWAVES_FRAGMENT_SHADER).toContain('u_time')
    expect(PULSE_FRAGMENT_SHADER).toContain('u_speed')
    expect(FILMGRAIN_FRAGMENT_SHADER).toContain('random')
  })
})

describe('scene-webgl: particle-engine', () => {
  it('updates and spawns particles continuously', () => {
    const engine = new WebGlParticleEngine()
    expect(engine.getParticles().length).toBe(0)

    // Simulate 0.5s of physics step
    engine.update(0.5, 1920, 1080)
    expect(engine.getParticles().length).toBeGreaterThan(0)

    // Check properties of spawned particle
    const p = engine.getParticles()[0]
    expect(p.maxLife).toBeGreaterThan(0)
    expect(p.size).toBeGreaterThan(0)

    engine.clear()
    expect(engine.getParticles().length).toBe(0)
  })
})

describe('scene-webgl: puppet-renderer', () => {
  it('computes harmonic motion for character breathing and ears', () => {
    const m0 = computePuppetMotion(0)
    expect(m0.breatheOffset).toBeCloseTo(0)

    const m1 = computePuppetMotion(Math.PI / 3.6) // quarter cycle
    expect(Math.abs(m1.breatheOffset)).toBeGreaterThan(0)
    expect(typeof m1.earSwayAngle).toBe('number')
    expect(typeof m1.hairSwayAngle).toBe('number')
  })
})
