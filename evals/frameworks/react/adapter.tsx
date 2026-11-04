// Framework adapter: hidden tests only talk to the DOM through these helpers.
import { act, render } from '@testing-library/react'
import { Profiler, type ComponentType } from 'react'
import { vi } from 'vitest'

export const framework = 'react'

// RTL's async wrapper only advances fake timers when it sees a `jest` global; give it vitest's.
;(globalThis as any).jest ??= { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) }

// Render work done by the framework, for the v3 perf probe. Solid has no re-renders, so it reports null.
export const stats = { commits: 0 as number | null, ms: 0 }
const onRender = (_id: string, _phase: string, ms: number) => {
  stats.commits!++
  stats.ms += ms
}

export function mount<P extends object>(Component: ComponentType<P>, props: P) {
  let current = props
  const tree = (p: P) => (
    <Profiler id="app" onRender={onRender}>
      <Component {...p} />
    </Profiler>
  )
  const result = render(tree(current))
  return {
    container: result.container,
    async setProps(next: Partial<P>) {
      current = { ...current, ...next }
      result.rerender(tree(current))
    },
    unmount: () => result.unmount(),
  }
}

// Run an outside-the-UI update (e.g. a server push) the way the framework expects.
export function run(fn: () => void) {
  act(() => {
    fn()
  })
}

export async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

export async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}
