// @vitest-environment jsdom
// `tabs.channel` and `sync: 'tabs'` (research 32 §1): a `render()` is a tab, a shared `storage` is the shared
// `localStorage`, and @kerf-js/core/test's BroadcastChannel carries the messages.
import { createRoot, state } from '../src/index'
import { defineState } from '../src/scope'
import '../src/persist'
import '../src/sync'
import { tabs as browser } from '../src/browser'
import { flush, leaks, memoryStorage, render, screen, tabs, user } from '../src/test'

const count = {
  '~standard': {
    validate: (v: unknown) =>
      typeof (v as { count?: unknown } | undefined)?.count === 'number'
        ? { value: v as { count: number } }
        : { issues: [{ message: 'no count' }] },
  },
}
const lines = {
  '~standard': {
    validate: (v: unknown) =>
      v && typeof v === 'object' && Object.values(v).every((n) => typeof n === 'number')
        ? { value: v as Record<string, number> }
        : { issues: [{ message: 'not lines' }] },
  },
}

describe('tabs.channel', () => {
  function Cart() {
    const bus = browser.channel('cart', count)
    const seen: number[] = []
    bus.on((m) => seen.push(m.count))
    return (
      <>
        <p aria-label="last">{bus.value?.count ?? 'none'}</p>
        <button onClick={() => bus.post({ count: 7 })}>post</button>
        <p aria-label="seen">{String(seen.length)}</p>
      </>
    )
  }

  test('a message from another tab reaches the box and the handler', async () => {
    render(Cart)
    await tabs.post('cart', { count: 3 })
    expect(screen.getByLabelText('last').textContent).toBe('3')
  })

  test('a message the schema refuses is dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(Cart)
    await tabs.post('cart', { count: 'x' })
    expect(screen.getByLabelText('last').textContent).toBe('none')
    expect(warn.mock.calls[0]![0]).toContain('dropped')
    warn.mockRestore()
  })

  test('post reaches other tabs, not this one', async () => {
    render(Cart)
    const other = render(Cart)
    await user.click(screen.getAllByRole('button')[0]!)
    await flush()
    expect(tabs.posted('cart')).toEqual([{ count: 7 }])
    expect(screen.getAllByLabelText('last').map((e) => e.textContent)).toEqual(['none', 'none'])
    other.unmount()
  })

  test('a wrong post throws in dev', () => {
    createRoot((dispose) => {
      const bus = browser.channel('cart', count)
      expect(() => bus.post({ count: 'x' } as never)).toThrow('schema')
      dispose()
    })
  })

  test('the channel goes with its owner (T012 sees it before)', () => {
    createRoot((dispose) => {
      browser.channel('cart', count)
      expect(leaks().join()).toContain("tabs.channel('cart')")
      dispose()
    })
    expect(leaks()).toEqual([])
  })

  test('outside an owner is W051', () => {
    expect(() => browser.channel('cart', count)).toThrow('W051')
  })
})

function syncFixture() {
  const cart = defineState('cart-sync', () => {
    const lines$ = state<Record<string, number>>(
      {},
      { persist: { in: 'memory', schema: lines, version: 1 }, sync: 'tabs', name: 'lines' },
    )
    const note = state('', { persist: 'memory', sync: 'tabs' })
    return {
      lines: lines$,
      note,
      add: (id: string) =>
        lines$.set((d) => {
          d[id] = (d[id] ?? 0) + 1
        }),
    }
  })

  function Tab(props: { name: string }) {
    return (
      <>
        <p aria-label={`lines ${props.name}`}>{JSON.stringify(cart.lines.value)}</p>
        <p aria-label={`note ${props.name}`}>{cart.note.value}</p>
        <button onClick={() => cart.add(props.name)}>add {props.name}</button>
        <button
          onClick={() => {
            cart.note.value = props.name
          }}
        >
          note {props.name}
        </button>
      </>
    )
  }
  const two = () => {
    const storage = memoryStorage()
    render(Tab, { name: 'a' }, { storage })
    render(Tab, { name: 'b' }, { storage })
    return storage
  }
  const lineText = (n: string) => screen.getByLabelText(`lines ${n}`).textContent

  return { Tab, two, lineText }
}

function registerTabSync({ Tab, two, lineText }: ReturnType<typeof syncFixture>) {
  test('tabs sync on plain http, where the browser has no crypto.randomUUID', async () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      two()
      await user.click(screen.getByRole('button', { name: 'note a' }))
      await flush()
      expect(screen.getByLabelText('note b').textContent).toBe('a')
    } finally {
      Reflect.deleteProperty(crypto, 'randomUUID')
    }
  })

  test('a write reaches the other tab and only touches its readers', async () => {
    two()
    await user.click(screen.getByRole('button', { name: 'note a' }))
    await flush()
    expect(screen.getByLabelText('note b').textContent).toBe('a')
  })

  test('two tabs adding different keys merge, and storage holds both', async () => {
    const storage = two()
    await Promise.all([
      user.click(screen.getByRole('button', { name: 'add a' })),
      user.click(screen.getByRole('button', { name: 'add b' })),
    ])
    await flush()
    await flush()
    expect(JSON.parse(lineText('a'))).toEqual({ a: 1, b: 1 })
    expect(JSON.parse(lineText('b'))).toEqual({ a: 1, b: 1 })
    expect(JSON.parse(storage.getItem('kerf:app:cart-sync.lines')!).data).toEqual({ a: 1, b: 1 })
  })

  test('a later tab reads what the others stored', async () => {
    const storage = two()
    await user.click(screen.getByRole('button', { name: 'add a' }))
    await flush()
    render(Tab, { name: 'c' }, { storage })
    expect(lineText('c')).toBe('{"a":1}')
  })
}

function registerTabConflict({ two, lineText }: ReturnType<typeof syncFixture>) {
  test('a write from a tab on another schema is dropped', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    two()
    const bc = new BroadcastChannel('kerf:state:app')
    bc.postMessage({
      s: 'cart-sync.lines',
      at: Date.now() + 1000,
      t: 'x',
      p: { a: 'not a number' },
      d: [],
    })
    await flush()
    bc.close()
    expect(lineText('a')).toBe('{}')
    expect(error.mock.calls[0]![0]).toContain('S008')
    error.mockRestore()
  })

  test('an older write loses to a newer one, per key', async () => {
    two()
    const bc = new BroadcastChannel('kerf:state:app')
    const now = Date.now()
    bc.postMessage({ s: 'cart-sync.lines', at: now + 2000, t: 'x', p: { k: 2 }, d: [] })
    bc.postMessage({ s: 'cart-sync.lines', at: now + 1000, t: 'y', p: { k: 1, j: 1 }, d: [] })
    await flush()
    bc.close()
    expect(JSON.parse(lineText('a'))).toEqual({ k: 2, j: 1 })
  })
}

describe("sync: 'tabs'", () => {
  const fixture = syncFixture()
  registerTabSync(fixture)
  registerTabConflict(fixture)
  test('`session`, or no persist, is S008', () => {
    const bad = defineState('sync-session', () => ({
      n: state(0, { persist: 'session', sync: 'tabs' }),
    }))
    const none = defineState('sync-none', () => ({ n: state(0, { sync: 'tabs' }) }))
    const read = (s: { n: { value: number } }) => () => render(() => <p>{s.n.value}</p>)
    expect(read(bad)).toThrow('S008')
    expect(read(none)).toThrow('S008')
  })
})
