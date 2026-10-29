// weft-allow T004, T005: the bridge's clock replaces the page's timers itself, and one test clicks the raw DOM the way another browser tool would
// weft/agent and weft/devtools: what an agent sees and does in the running app (research 22). No weft/test here: the
// bridge brings its own page fakes (clock, network), and these tests check them.
import { derived, onCleanup, state } from 'weft'
import { render } from 'weft/dom'
import { act, assert, clock, net, record, run, snapshot } from 'weft/agent'
import { graph, set } from 'weft/devtools'

function Stock(props: { stock: number }) {
  const qty = state(0)
  const left = derived(() => props.stock - qty.value)
  return (
    <div>
      <p role="status">{left.value > 0 ? `Only ${left.value} left` : 'Out of stock'}</p>
      <button onClick={() => qty.value++} disabled={left.value <= 0}>Add</button>
    </div>
  )
}

function Later() {
  const loaded = state(false)
  const ticks = state(0)
  setTimeout(() => (loaded.value = true), 1000)
  const id = setInterval(() => ticks.value++, 250)
  onCleanup(() => clearInterval(id))
  return <p role="status">{loaded.value ? `Loaded after ${ticks.value} ticks` : 'Loading'}</p>
}

let dispose: (() => void) | undefined
const mount = (fn: () => any) => {
  const el = document.body.appendChild(document.createElement('div'))
  const stop = render(fn, el)
  dispose = () => { stop(); el.remove() }
}
afterEach(() => { dispose?.(); dispose = undefined; record.stop(); clock.resume(); net.reset() })

test('snapshot: roles, names, refs and the named graph', async () => {
  mount(() => <Stock stock={2} />)
  const s: any = await snapshot()
  expect(s.tree).toContain('- status [ref=')
  expect(s.tree).toContain(': Only 2 left')
  expect(s.tree).toMatch(/- button "Add" \[ref=e\d+\]/)
  expect(s.graph).toContain('Stock.qty = 0')
  expect(s.graph).toContain('Stock.left = 2 ← Stock.qty')
  const nodes = graph('Stock')
  expect(nodes.map(n => n.name)).toEqual(['Stock.left', 'Stock.qty'])
  expect(nodes[1].feeds).toContain('Stock.left')
})

test('act clicks like a user and returns what changed; assert retries what the user sees', async () => {
  mount(() => <Stock stock={2} />)
  const r = await act({ role: 'button', name: 'Add' }, 'click')
  expect(r.changes).toContain('Only 1 left')
  expect((await assert({ role: 'status' }, { text: 'Only 1 left' })).ok).toBe(true)
  await act({ role: 'button', name: 'Add' }, 'click')
  expect((await assert({ role: 'button', name: 'Add' }, { disabled: true })).ok).toBe(true)
  const miss = await assert({ role: 'status' }, { text: 'Only 9 left' }, { timeout: 50 })
  expect(miss).toMatchObject({ ok: false, actual: 'Out of stock' })
})

test('acting by a snapshot ref, and a clear error when a name is ambiguous', async () => {
  mount(() => <><Stock stock={1} /><Stock stock={3} /></>)
  const s: any = await snapshot({ interactive: true, graph: false })
  const ref = /button "Add" \[ref=(e\d+)\]/.exec(s.tree)![1]
  await act(`@${ref}`, 'click')
  expect(document.body.textContent).toContain('Out of stock')
  await expect(act({ role: 'button', name: 'Add' }, 'click')).rejects.toThrow(/2 elements match button "Add"/)
  expect(graph('Stock').map(n => n.name)).toEqual(['Stock#1.left', 'Stock#1.qty', 'Stock#2.left', 'Stock#2.qty'])
})

test('set writes state by its graph name; derived values refuse', async () => {
  mount(() => <Stock stock={5} />)
  expect(set('Stock.qty', 5)).toMatchObject({ name: 'Stock.qty', value: 5 })
  expect(document.body.textContent).toContain('Out of stock')
  expect(() => set('Stock.left', 1)).toThrow(/derived; set what it reads instead \(Stock\.qty\)/)
  expect(() => set('Nope.x', 1)).toThrow(/no state named Nope\.x/)
})

test('record turns acts and asserts into a weft/test test', async () => {
  mount(() => <Stock stock={2} />)
  record.start()
  await act({ role: 'button', name: 'Add' }, 'click')
  await assert({ role: 'status' }, { text: 'Only 1 left' })
  document.querySelector('button')!.click() // a click from the agent's own browser tool, not through `act`
  await assert({ role: 'button', name: 'Add' }, { disabled: true })
  const { code, asserts } = record.code({ component: 'Stock', from: './Stock', props: '{ stock: 2 }' })
  expect(asserts).toBe(2)
  expect(code).toBe(`import { expect, test } from 'vitest'
import { render, screen, user } from 'weft/test'
import { Stock } from "./Stock"

test("recorded: /", async () => {
  render(Stock, { stock: 2 })
  await user.click(await screen.findByRole("button", { name: "Add" }))
  expect(screen.getByRole("status").textContent).toContain("Only 1 left")
  await user.click(screen.getByRole("button", { name: "Add" }))
  expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true)
})
`)
})

test('the clock: pause, advance runs what falls due in order, resume hands back to real time', async () => {
  clock.pause()
  const t0 = Date.now()
  mount(() => <Later />)
  await clock.advance(999)
  expect(document.body.textContent).toBe('Loading')
  await clock.advance(1)
  expect(document.body.textContent).toBe('Loaded after 4 ticks')
  expect(Date.now() - t0).toBe(1000)
  expect(clock.status()).toMatchObject({ installed: true, pending: 1 }) // the interval
  clock.resume()
  expect(clock.status().installed).toBe(false)
})

test('the network: offline fails fetch, fires the events, and drops open sockets', async () => {
  const seen: string[] = []
  addEventListener('offline', () => seen.push('offline'))
  addEventListener('online', () => seen.push('online'))
  const ws = new WebSocket('ws://127.0.0.1:9/never')
  ws.onerror = () => {}
  expect(net.status().sockets).toBe(1)
  await net.offline()
  expect(navigator.onLine).toBe(false)
  expect(net.status().sockets).toBe(0)
  await expect(fetch('http://127.0.0.1:9/x')).rejects.toThrow(/offline/)
  await net.online()
  expect(navigator.onLine).toBe(true)
  expect(seen).toEqual(['offline', 'online'])
  expect(net.latency(120)).toMatchObject({ latency: 120, online: true })
})

test('commands by name, as the dev server relays them', async () => {
  mount(() => <Stock stock={2} />)
  await run('act', { target: { role: 'button', name: 'Add' }, action: 'click' })
  expect(await run('assert', { target: { role: 'status' }, expect: { text: 'Only 1 left' } })).toMatchObject({ ok: true })
  expect(await run('graph', { filter: 'Stock.qty' })).toMatchObject({ graph: expect.stringContaining('Stock.qty = 1') })
  await expect(run('nope')).rejects.toThrow(/unknown command nope/)
})
