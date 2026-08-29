/**
 * Puppet mesh animation and vertex deformation solver.
 */

export interface PuppetMotionState {
  time: number
  breatheOffset: number
  earSwayAngle: number
  hairSwayAngle: number
}

/**
 * Calculate dynamic Live2D-style motion state for character parts (ears, hair, breathing).
 */
export function computePuppetMotion(timeSec: number): PuppetMotionState {
  // Breathing: smooth sine wave (~18 breaths/min)
  const breatheFreq = 1.8
  const breatheOffset = Math.sin(timeSec * breatheFreq) * 6.0

  // Ear twitch & sway: combined harmonics
  const earSwayAngle = Math.sin(timeSec * 2.5) * 0.04 + Math.sin(timeSec * 5.0) * 0.02

  // Hair sway in gentle wind
  const hairSwayAngle = Math.sin(timeSec * 1.5 + 0.5) * 0.03

  return {
    time: timeSec,
    breatheOffset,
    earSwayAngle,
    hairSwayAngle,
  }
}
