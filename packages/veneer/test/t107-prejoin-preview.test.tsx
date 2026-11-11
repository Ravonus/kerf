import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { Prejoin, type PrejoinProps } from '../src/live/Prejoin'

afterEach(() => {
  document.body.innerHTML = ''
})

test('preview receives original props and preserves the returned node through live replacement', async () => {
  const first = document.createElement('video')
  const next = document.createElement('video')
  const calls: Array<{ receiver: unknown; node: Element }> = []
  const initial = function (this: unknown) {
    calls.push({ receiver: this, node: first })
    return first
  }
  const replacement = function (this: unknown) {
    calls.push({ receiver: this, node: next })
    return next
  }
  const current = state<(() => unknown) | undefined>(initial)
  const props = {
    get preview() {
      return current.value
    },
  } as PrejoinProps
  const { container } = render(() => Prejoin(props))
  await flush()
  expect(calls.length).toBeGreaterThan(0)
  for (const call of calls) expect(call.receiver).toBe(props)
  expect(container.querySelector('[data-part="video"]')!.firstChild).toBe(first)
  current.value = replacement
  await flush()
  expect(calls.at(-1)!.receiver).toBe(props)
  expect(calls.at(-1)!.node).toBe(next)
  expect(container.querySelector('[data-part="video"]')!.firstChild).toBe(next)
  current.value = undefined
  await flush()
  expect(container.querySelector('[data-part="video"]')).toBeNull()
  expect(container.querySelector('[data-scope="avatar"]')).not.toBeNull()
})

test('camera off suppresses preview reads and restores the current callback on re-enable', async () => {
  const trace: string[] = []
  const current = state<(() => unknown) | undefined>(function (this: unknown) {
    trace.push(this === props ? 'first:original' : 'first:other')
    return document.createElement('video')
  })
  const camera = state(false)
  const props = {
    get camera() {
      return camera.value
    },
    get preview() {
      trace.push('read')
      return current.value
    },
  } as PrejoinProps
  render(() => Prejoin(props))
  await flush()
  expect(trace).toEqual([])
  current.value = function (this: unknown) {
    trace.push(this === props ? 'next:original' : 'next:other')
    return document.createElement('video')
  }
  await flush()
  expect(trace).toEqual([])
  camera.value = true
  await flush()
  expect(trace).toContain('next:original')
  expect(trace).not.toContain('first:original')
})

test('preview presence and invocation each read the current callback in order', async () => {
  const trace: string[] = []
  const old = function (this: unknown) {
    trace.push(this === props ? 'old:original' : 'old:other')
    return document.createElement('video')
  }
  const replacement = function (this: unknown) {
    trace.push(this === props ? 'new:original' : 'new:other')
    return document.createElement('video')
  }
  let next = old
  const props: PrejoinProps = {
    get preview() {
      trace.push('lookup')
      const value = next
      next = replacement
      return value
    },
  }
  const { container } = render(() => Prejoin(props))
  await flush()
  expect(container.querySelector('[data-part="video"] video')).not.toBeNull()
  expect(trace).toEqual(['lookup', 'lookup', 'new:original'])
})

test('preview throws the same error without changing its receiver', () => {
  const sentinel = new Error('preview failed')
  const receivers: unknown[] = []
  const props: PrejoinProps = {
    preview(this: unknown) {
      receivers.push(this)
      throw sentinel
    },
  }
  let caught: unknown
  try {
    render(() => Prejoin(props))
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(sentinel)
  expect(receivers).toHaveLength(1)
  expect(receivers[0]).toBe(props)
})
