// defineState (PLAN §4.5, research 14 §2) and keyed reads of object boxes.
// weft-allow T004: persistence writes land on a macrotask; `tick` waits for that, not for an update
import { screen } from '@testing-library/dom'
import { z } from 'zod'
import { defineState, derived, flush as flushGraph, state, StateError } from 'weft'
import { flush, memoryStorage, render, scope, touches } from 'weft/test'

const tick = () => new Promise(r => setTimeout(r))

describe('keyed reads: box.get(key)', () => {
  test('a reader of one entry re-runs only when that entry changes', () => {
    const cart = state<Record<string, number>>({ a: 1, b: 1 })
    let a = 0, b = 0, all = 0
    const ra = derived(() => (a++, cart.get('a')))
    const rb = derived(() => (b++, cart.get('b')))
    const rall = derived(() => (all++, Object.keys(cart.value).length))
    ra.value; rb.value; rall.value
    cart.set(d => { d.a = 2 })
    expect([ra.value, rb.value, rall.value]).toEqual([2, 1, 2])
    expect([a, b, all]).toEqual([2, 1, 2])
    cart.set(d => { d.c = 1 })
    ra.value; rb.value; rall.value
    expect([a, b, all]).toEqual([2, 1, 3])
  })

  test('a removed entry reads undefined and its reader re-runs', () => {
    const cart = state<Record<string, number>>({ a: 1 })
    const ra = derived(() => cart.get('a'))
    expect(ra.value).toBe(1)
    cart.value = {}
    expect(ra.value).toBeUndefined()
  })

  test('150 rows: add-one re-runs one row binding, not all of them', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `p${i}`)
    const cart = state<Record<string, number>>({})
    const Rows = () => <ul>{ids.map(id => <li key={id}>{cart.get(id) ?? 0}</li>)}</ul>
    render(Rows)
    await flush()
    const t = await touches(() => cart.set(d => { d.p7 = 1 }))
    expect(t.mutations).toBe(1)
    expect(t.runs).toBeLessThanOrEqual(2)
  })
})

describe('defineState', () => {
  test('setup runs once per app, lazily, and boxes get dev names', () => {
    let runs = 0
    const s = defineState('names', () => {
      runs++
      const open = state(false)
      return { open, toggle() { open.value = !open.value } }
    })
    expect(runs).toBe(0)
    const a = scope(s)
    a.toggle()
    a.toggle()
    expect(runs).toBe(1)
    expect((a.open as any).n).toBe('names.open')
    expect(a.toggle.name).toBe('names.toggle')
    expect(s.$name).toBe('names')
  })

  test('each render() gets a fresh instance; options.state seeds it', async () => {
    const notes = defineState('notes', () => ({ note: state('') }))
    const View = () => <p>{notes.note.value || 'empty'}</p>
    render(View, {}, { state: { notes: { note: 'hi' } } })
    await flush()
    expect(screen.getByText('hi')).toBeTruthy()
    notes.note.value = 'changed'
    render(View)
    await flush()
    expect(screen.getByText('empty')).toBeTruthy()
  })

  test('one action call is one undo step, nested actions join it', () => {
    const board = defineState('board', () => {
      const cards = state<string[]>([])
      const zoom = state(1, { history: false })
      const add = (c: string) => cards.set(d => { d.push(c) })
      return { cards, zoom, add, addTwo(a: string, b: string) { add(a); add(b); zoom.value = 2 } }
    }, { history: { limit: 10 } })
    const b = scope(board)
    b.add('x')
    b.addTwo('y', 'z')
    expect(b.cards.value).toEqual(['x', 'y', 'z'])
    expect(b.$history.entries.value.map(e => e.action)).toEqual(['board.add', 'board.addTwo'])
    b.$history.undo()
    expect(b.cards.value).toEqual(['x'])
    expect(b.zoom.value).toBe(2) // history: false
    b.$history.redo()
    expect(b.cards.value).toEqual(['x', 'y', 'z'])
    b.$history.undo()
    b.$history.undo()
    expect(b.cards.value).toEqual([])
    expect(b.$history.canUndo.value).toBe(false)
    expect(b.$history.canRedo.value).toBe(true)
  })

  test('writes outside actions group per microtask; the history limit holds', async () => {
    const form = defineState('form', () => ({ a: state(0), b: state(0) }), { history: { limit: 2 } })
    const f = scope(form)
    f.a.value = 1; f.b.value = 1
    await tick()
    f.a.value = 2
    await tick()
    f.a.value = 3
    await tick()
    expect(f.$history.entries.value.map(e => e.action)).toEqual(['form.write', 'form.write'])
    f.$history.undo()
    expect(f.a.value).toBe(2)
  })

  test('$reset restores every box and clears history; $snapshot is frozen plain data', () => {
    const prefs = defineState('prefs', () => {
      const size = state(14)
      const tags = state<string[]>([])
      return { size, tags, double: derived(() => size.value * 2), bump() { size.value++ } }
    }, { history: { limit: 5 } })
    const p = scope(prefs)
    p.bump()
    p.tags.set(d => { d.push('a') })
    const snap = p.$snapshot()
    expect(snap).toEqual({ size: 15, tags: ['a'], double: 30 })
    expect(Object.isFrozen(snap.tags)).toBe(true)
    p.$reset()
    expect([p.size.value, p.tags.value, p.$history.canUndo.value]).toEqual([14, [], false])
  })

  test('S009: duplicate names and setup cycles', () => {
    defineState('dup', () => ({}))
    expect(() => defineState('dup', () => ({}))).toThrow(/S009/)
    const loop: any = defineState('loop', () => ({ x: loop.x }))
    expect(() => scope(loop)).toThrow(/S009.*cycle/)
  })

  test('S004: a god scope is reported', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const big = defineState('big', () => Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`b${i}`, state(i)])))
    scope(big)
    expect(err.mock.calls[0][0]).toMatch(/^S004/)
    err.mockRestore()
  })
})

describe('persist', () => {
  test('round-trips through storage, coalesced to one write per microtask', async () => {
    const storage = memoryStorage()
    const set = vi.spyOn(storage, 'setItem')
    const theme = defineState('theme', () => ({ dense: state(false, { persist: 'memory' }) }))
    const a = scope(theme, { storage, name: 'shop' })
    a.dense.value = true
    a.dense.value = false
    a.dense.value = true
    await tick()
    expect(set).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.getItem('weft:shop:theme.dense')!)).toMatchObject({ v: 1, data: true })
    expect(scope(theme, { storage, name: 'shop' }).dense.value).toBe(true) // a reload
  })

  test('localStorage, with a schema, a version and migrations', async () => {
    localStorage.setItem('weft:app:guest.lines', JSON.stringify({ v: 1, at: 0, data: [{ id: 'a', qty: 2 }] }))
    const guest = defineState('guest', () => ({
      lines: state<Record<string, number>>({}, {
        persist: {
          in: 'local',
          schema: z.record(z.string(), z.number().int().min(1)),
          version: 2,
          migrate: { 1: (v: { id: string; qty: number }[]) => Object.fromEntries(v.map(l => [l.id, l.qty])) },
        },
      }),
    }))
    const g = scope(guest)
    expect(g.lines.value).toEqual({ a: 2 })
    g.lines.set(d => { d.b = 1 })
    await tick()
    expect(JSON.parse(localStorage.getItem('weft:app:guest.lines')!)).toMatchObject({ v: 2, data: { a: 2, b: 1 } })
    localStorage.clear()
  })

  test('S003: a payload that fails its schema falls back to init and is kept aside', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = memoryStorage()
    storage.setItem('weft:app:qty.n', JSON.stringify({ v: 1, at: 0, data: -5 }))
    const qty = defineState('qty', () => ({ n: state(1, { persist: { in: 'memory', schema: z.number().min(0) } }) }))
    expect(scope(qty, { storage }).n.value).toBe(1)
    expect(storage.getItem('weft:app:qty.n:corrupt')).toContain('-5')
    expect(err.mock.calls[0][0]).toMatch(/^S003/)
    err.mockRestore()
  })

  test('S003: a stored version with no migration path', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = memoryStorage()
    storage.setItem('weft:app:mig.n', JSON.stringify({ v: 1, at: 0, data: 3 }))
    const mig = defineState('mig', () => ({ n: state(0, { persist: { in: 'memory', version: 3, migrate: { 1: (v: number) => v } } }) }))
    expect(scope(mig, { storage }).n.value).toBe(0)
    expect(err.mock.calls[0][0]).toMatch(/no migrate\[2\]/)
    err.mockRestore()
  })

  test('S008: misconfigured persistence throws with the fix', () => {
    const noSchema = defineState('noSchema', () => ({ list: state<string[]>([], { persist: 'local' }) }))
    expect(() => scope(noSchema)).toThrow(StateError)
    expect(() => scope(noSchema)).toThrow(/S008.*schema/)
    const priv = defineState('priv', () => { state(0, { persist: 'local' }); return {} })
    expect(() => scope(priv)).toThrow(/S008.*name/)
    const named = defineState('named', () => { const hidden = state(4, { persist: 'memory', name: 'hidden' }); return { read: () => hidden.value } })
    expect(scope(named).read()).toBe(4)
    const idb = defineState('idb', () => ({ c: state('', { persist: { in: 'idb' as any } }) }))
    expect(() => scope(idb)).toThrow(/S008.*idb/)
  })

  test('S010: a non-serializable value is reported and not written', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = memoryStorage()
    const when = defineState('when', () => ({ at: state<unknown>(null, { persist: { in: 'memory', schema: z.any() } }) }))
    const w = scope(when, { storage })
    w.at.value = new Date(0)
    await tick()
    expect(err.mock.calls[0][0]).toMatch(/^S010.*Date/)
    expect(storage.getItem('weft:app:when.at')).toBeNull()
    err.mockRestore()
  })

  test('$reset rewrites persisted boxes', async () => {
    const storage = memoryStorage()
    const r = defineState('resettable', () => ({ n: state(1, { persist: 'memory' }) }))
    const s = scope(r, { storage })
    s.n.value = 9
    await tick()
    s.$reset()
    flushGraph()
    await tick()
    expect(JSON.parse(storage.getItem('weft:app:resettable.n')!).data).toBe(1)
  })
})
