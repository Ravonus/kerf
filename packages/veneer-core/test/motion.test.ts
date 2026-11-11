// leave(): data-state="closed" goes on, done waits for the exit the CSS plays (or runs at once with none), the state
// comes off after, and stay() keeps a reopened element open.
import { leave, stay } from '../src/motion'

const tick = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms)
  })

const fake = () => {
  let end!: () => void
  const finished = new Promise<void>((r) => {
    end = r
  })
  return { anim: { finished, effect: { getComputedTiming: () => ({ endTime: 200 }) } }, end }
}

test('with no exit to play, done runs at once and the state comes off', () => {
  const el = document.createElement('div')
  let done = 0
  leave(el, () => done++)
  expect(done).toBe(1)
  expect(el.dataset.state).toBeUndefined()
})

test('done waits for the exit, with data-state="closed" on meanwhile', async () => {
  const el = document.createElement('div')
  const f = fake()
  el.getAnimations = () => [f.anim as unknown as Animation]
  let done = 0
  leave(el, () => done++)
  expect(el.dataset.state).toBe('closed')
  expect(done).toBe(0)
  f.end()
  await tick(0)
  expect(done).toBe(1)
  expect(el.dataset.state).toBeUndefined()
})

test('stay() cancels a pending leave: done never runs', async () => {
  const el = document.createElement('div')
  const f = fake()
  el.getAnimations = () => [f.anim as unknown as Animation]
  let done = 0
  leave(el, () => done++)
  expect(stay(el)).toBe(true)
  f.end()
  await tick(250)
  expect(done).toBe(0)
  expect(stay(el)).toBe(false)
})
