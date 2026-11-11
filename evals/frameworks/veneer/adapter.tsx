// Framework adapter: hidden tests only talk to the DOM through these helpers.
import { state } from '@kerf/core'
import { stats as graph } from '@kerf/core/internal'
import { flush as flushKerf, render } from '@kerf/core/test'
import { vi } from 'vitest'

export const framework = 'kerf'

// `commits` counts kerf's reactive re-runs (derived/watch/JSX holes), the closest analogue of React commits.
export const stats = {
  get commits(): number | null {
    return graph.runs
  },
  ms: 0,
}

export function mount<P extends object>(Comp: (props: P) => any, props: P) {
  const current = state<P>({ ...props })
  const live = new Proxy({} as P, { get: (_, k) => (current.value as any)[k] })
  const handle = render(Comp, live)
  return {
    container: handle.container,
    async setProps(next: Partial<P>) {
      current.value = { ...current.value, ...next }
    },
    unmount: () => handle.unmount(),
  }
}

export function run(fn: () => void) {
  fn()
}

export async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

export async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await flushKerf()
}
