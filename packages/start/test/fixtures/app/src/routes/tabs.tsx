import { defineState, state } from '@weft-js/core'
import { tabs } from '@weft-js/core/browser'
import { object } from '../schema'

const Cart = defineState('cart', () => ({
  lines: state<Record<string, number>>(
    {},
    {
      persist: {
        in: 'local',
        schema: {
          '~standard': { version: 1, vendor: 'x', validate: (value: unknown) => ({ value }) },
        } as any,
        version: 1,
      },
      sync: 'tabs',
    },
  ),
}))

export default function Tabs() {
  const pings = tabs.channel('pings', object({ n: 'number' }))
  const seen = state(0)
  pings.on((m) => {
    seen.value = m.n
  })
  return (
    <main>
      <output aria-label="seen">{seen.value}</output>
      <output aria-label="lines">{JSON.stringify(Cart.lines.value)}</output>
      <button aria-label="ping" onClick={() => pings.post({ n: 7 })}>
        ping
      </button>
      <button
        aria-label="a"
        onClick={() => {
          Cart.lines.value = { ...Cart.lines.value, a: 1 }
        }}
      >
        a
      </button>
      <button
        aria-label="b"
        onClick={() => {
          Cart.lines.value = { ...Cart.lines.value, b: 2 }
        }}
      >
        b
      </button>
    </main>
  )
}
