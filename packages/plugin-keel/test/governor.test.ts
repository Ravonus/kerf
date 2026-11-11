// The governor on recorded devices: a tier's levers, fps and pixel-ratio cap, and the render scale under load.
import { describe, expect, it } from 'vitest'
import { keelGovernor } from '../src/governor'

const DESKTOP = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  touchPoints: 0,
  shortSide: 900,
  pixelRatio: 2,
  uniforms: 1024,
  memory: 8,
  cores: 10,
}
const SOFTWARE = { ...DESKTOP, gpu: 'Google SwiftShader' }

describe('keelGovernor', () => {
  it("spends quality's high levers on a strong desktop, up to 2x and 3840 px across", async () => {
    const governor = keelGovernor({ signals: DESKTOP })
    await governor.start()
    expect(governor.tier).toBe('high')
    expect(governor.fps).toBe(60)
    expect(governor.levers).toEqual({
      renderScale: 1,
      bloom: 1,
      motes: 0.8,
      blendScale: 0.75,
      taa: true,
      density: 1,
    })
    expect(governor.pixelRatio(1440)).toBe(2)
    expect(governor.pixelRatio(2560)).toBe(1.5)
    expect(governor.hold).toBe(false)
  })

  it('holds a low device to 30 fps, no bloom or TAA, and 1280 px across', async () => {
    const governor = keelGovernor({ signals: SOFTWARE })
    await governor.start()
    expect(governor.tier).toBe('low')
    expect(governor.fps).toBe(30)
    expect(governor.levers).toMatchObject({ bloom: 0, taa: false, blendScale: 0.5, density: 0.5 })
    expect(governor.pixelRatio(1280)).toBe(1)
    expect(governor.hold).toBe(true)
  })

  it('lowers the render scale while frames run slow, and gives it back when they recover', async () => {
    const governor = keelGovernor({ signals: DESKTOP })
    await governor.start()
    const before = governor.levers
    for (let i = 0; i < 120; i++) governor.frame(40)
    expect(governor.levers.renderScale).toBeLessThan(1)
    expect(governor.levers).not.toBe(before)
    for (let i = 0; i < 600; i++) governor.frame(8)
    expect(governor.levers.renderScale).toBe(1)
    const steady = governor.levers
    governor.frame(8)
    expect(governor.levers).toBe(steady)
  })
})
