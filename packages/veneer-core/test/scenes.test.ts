// The scene stage's arithmetic: the hand-over pair and `t`, the switch at 0.5, and the window of built scenes.
import { handover, sceneWindow } from '../src/scenes'

describe('handover', () => {
  it('shows the first scene alone until the second begins to enter', () => {
    expect(handover([0, 0, 0])).toEqual({ active: 0, from: 0, to: 0, t: 1 })
    expect(handover([1.4, 0, 0])).toEqual({ active: 0, from: 0, to: 0, t: 1 })
  })

  it('blends from the outgoing to the incoming as the incoming position runs over its hero height', () => {
    expect(handover([2.5, 0.25, 0])).toEqual({ active: 0, from: 0, to: 1, t: 0.25 })
    expect(handover([2.5, 0.6, 0], [1, 2])).toEqual({ active: 0, from: 0, to: 1, t: 0.3 })
  })

  it('switches the active scene at t = 0.5, not at the end of the blend', () => {
    expect(handover([2.9, 0.4999, 0]).active).toBe(0)
    expect(handover([2.9, 0.5, 0]).active).toBe(1)
  })

  it('stops blending once the incoming is in, and follows the last scene that has entered', () => {
    expect(handover([3.4, 1.2, 0])).toEqual({ active: 1, from: 1, to: 1, t: 1 })
    expect(handover([3.4, 3.4, 0.1])).toEqual({ active: 1, from: 1, to: 2, t: 0.1 })
    expect(handover([3.4, 3.4, 3])).toEqual({ active: 2, from: 2, to: 2, t: 1 })
  })
})

describe('sceneWindow', () => {
  it('keeps the active scene and both neighbours, the one ahead first', () => {
    expect(sceneWindow(3, 8)).toEqual([3, 4, 2])
    expect(sceneWindow(3, 8, -1)).toEqual([3, 2, 4])
  })

  it('stays inside the page', () => {
    expect(sceneWindow(0, 4)).toEqual([0, 1])
    expect(sceneWindow(3, 4)).toEqual([3, 2])
    expect(sceneWindow(0, 1, -1)).toEqual([0])
  })

  it('leaves out every scene two or more away, which the stage disposes', () => {
    const kept = sceneWindow(5, 12)
    for (let i = 0; i < 12; i++) expect(kept.includes(i)).toBe(Math.abs(i - 5) < 2)
  })
})
