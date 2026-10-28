// Framework adapter: hidden tests only talk to the DOM through these helpers.
import { render } from '@solidjs/testing-library'
import type { Component } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vi } from 'vitest'

export const framework = 'solid'

export const stats = { commits: null as number | null, ms: 0 }

export function mount<P extends object>(Comp: Component<P>, props: P) {
  const [current, setCurrent] = createStore<P>({ ...props })
  const result = render(() => <Comp {...current} />)
  return {
    container: result.container,
    async setProps(next: Partial<P>) {
      setCurrent(next as any)
    },
    unmount: () => result.unmount(),
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
}
