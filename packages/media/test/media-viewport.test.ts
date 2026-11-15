import { describe, expect, it } from 'vitest'
import { mediaViewportPlan } from '../src/media-viewport-policy'
const boxes = [0, 900, 1900, 3000, 10000, 10900].map((top) => ({
  top,
  bottom: top + 700,
  left: 0,
  right: 700,
  minimumVisible: 0.5,
}))
const motion = { y: 0, velocity: 0, direction: 1, height: 800, width: 800 }
describe('predictive media cohorts', () => {
  it('prepares the next work at rest and starts it before viewport entry', () => {
    const planned = mediaViewportPlan(boxes, motion)
    expect(planned[0]?.visible).toBe(true)
    expect(planned[1]?.preparing).toBe(true)
    expect(planned[1]?.anticipating).toBe(false)
    expect(mediaViewportPlan(boxes, { ...motion, y: 30 })[1]?.anticipating).toBe(true)
  })
  it('extends a bounded horizon with scroll speed and limits speculative decoders', () => {
    const slow = mediaViewportPlan(boxes, motion),
      fast = mediaViewportPlan(boxes, { ...motion, velocity: 4 })
    expect(slow[2]?.preparing).toBe(false)
    expect(fast[2]?.preparing).toBe(true)
    expect(fast.filter((s) => s.preparing)).toHaveLength(2)
    expect(fast[5]?.preparing).toBe(false)
  })
  it('targets scrollbar destinations without warming all skipped works', () => {
    const plans = mediaViewportPlan(boxes, { ...motion, target: 10000, velocity: 0 })
    expect(plans[1]?.preparing).toBe(false)
    expect(plans[4]?.preparing).toBe(true)
    expect(plans[4]?.anticipating).toBe(false)
    expect(plans[5]?.preparing).toBe(true)
  })
  it('changes direction immediately and respects data saver and a smaller slow-link cohort', () => {
    const up = mediaViewportPlan(boxes, { ...motion, y: 2600, velocity: -3, direction: -1 })
    expect(up[2]?.preparing).toBe(true)
    expect(up[4]?.preparing).toBe(false)
    expect(
      mediaViewportPlan(boxes, { ...motion, velocity: 5, slow: true }).filter((s) => s.preparing),
    ).toHaveLength(1)
    expect(
      mediaViewportPlan(boxes, { ...motion, speculate: false }).some(
        (s) => s.preparing || s.anticipating,
      ),
    ).toBe(false)
  })
})
