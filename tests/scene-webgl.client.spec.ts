// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { WebGlParticleEngine } from '../src/client/scene-webgl/particle-engine.ts'
import { PuppetSkeleton } from '../src/client/scene-webgl/puppet-renderer.ts'
import {
  BASE_FRAGMENT_SHADER,
  BASE_VERTEX_SHADER,
  BLOOM_COMBINE_FRAGMENT_SHADER,
  BLOOM_EXTRACT_FRAGMENT_SHADER,
  BLUR_FRAGMENT_SHADER,
  DEPTHPARALLAX_FRAGMENT_SHADER,
  FILMGRAIN_FRAGMENT_SHADER,
  FOLIAGESWAY_VERTEX_SHADER,
  GLITTER_FRAGMENT_SHADER,
  GODRAYS_FRAGMENT_SHADER,
  PULSE_FRAGMENT_SHADER,
  SHIMMER_FRAGMENT_SHADER,
  SKINNED_VERTEX_SHADER,
  WATERCAUSTICS_FRAGMENT_SHADER,
  WATERFLOW_FRAGMENT_SHADER,
  WATERRIPPLE_FRAGMENT_SHADER,
  WATERWAVES_FRAGMENT_SHADER,
} from '../src/client/scene-webgl/shaders.ts'

describe('scene-webgl: shaders', () => {
  it('defines valid vertex and fragment shader sources for all official effects', () => {
    expect(BASE_VERTEX_SHADER).toContain('a_position')
    expect(SKINNED_VERTEX_SHADER).toContain('u_boneMatrices')
    expect(BASE_FRAGMENT_SHADER).toContain('u_image')
    expect(WATERWAVES_FRAGMENT_SHADER).toContain('u_time')
    expect(WATERRIPPLE_FRAGMENT_SHADER).toContain('u_normalMap')
    expect(WATERFLOW_FRAGMENT_SHADER).toContain('u_flowMap')
    expect(WATERCAUSTICS_FRAGMENT_SHADER).toContain('voronoi')
    expect(FOLIAGESWAY_VERTEX_SHADER).toContain('u_swayAmount')
    expect(PULSE_FRAGMENT_SHADER).toContain('u_speed')
    expect(SHIMMER_FRAGMENT_SHADER).toContain('u_angle')
    expect(GLITTER_FRAGMENT_SHADER).toContain('u_density')
    expect(GODRAYS_FRAGMENT_SHADER).toContain('NUM_SAMPLES')
    expect(BLUR_FRAGMENT_SHADER).toContain('weights')
    expect(DEPTHPARALLAX_FRAGMENT_SHADER).toContain('u_depthMap')
    expect(FILMGRAIN_FRAGMENT_SHADER).toContain('random')
    expect(BLOOM_EXTRACT_FRAGMENT_SHADER).toContain('u_threshold')
    expect(BLOOM_COMBINE_FRAGMENT_SHADER).toContain('u_bloomStrength')
  })
})

describe('scene-webgl: particle-engine', () => {
  it('updates and spawns particles continuously with box emitter', () => {
    const engine = new WebGlParticleEngine()
    expect(engine.getParticles().length).toBe(0)

    // Simulate 0.5s of physics step
    engine.update(0.5, 1920, 1080)
    expect(engine.getParticles().length).toBeGreaterThan(0)

    // Check properties of spawned particle
    const p = engine.getParticles()[0]
    expect(p.maxLife).toBeGreaterThan(0)
    expect(p.size).toBeGreaterThan(0)
    expect(typeof p.r).toBe('number')

    engine.clear()
    expect(engine.getParticles().length).toBe(0)
  })

  it('supports sphere radial emitter', () => {
    const engine = new WebGlParticleEngine()
    engine.setEmitterConfig({ type: 'sphere', distMin: 50, distMax: 150 })
    engine.update(0.5, 1920, 1080)
    expect(engine.getParticles().length).toBeGreaterThan(0)
  })
})

describe('scene-webgl: puppet-skeleton', () => {
  it('evaluates 64 bone matrices', () => {
    const skeleton = new PuppetSkeleton()
    const matrices = skeleton.evaluate(null, 1.0)
    expect(matrices.length).toBe(64 * 16)
    // First matrix is identity
    expect(matrices[0]).toBe(1)
    expect(matrices[5]).toBe(1)
    expect(matrices[10]).toBe(1)
    expect(matrices[15]).toBe(1)
  })
})
