// @vitest-environment jsdom
// The client over weft/test's fake socket: the real channel client and the real socket server. One process is one
// client, so the other peers are frames from `net.publish`. Two real browsers are scripts/e2e-browsers.mjs.
import { channel, type StandardSchemaV1 } from '@weft/start'
import { state } from 'weft'
import { net, render, screen } from 'weft/test'
import { applyPeer, cursors, expire, hue, locate, presence, readCursor, relay, resolve } from '../src/index'
import { multiplayer } from '../src/server'

const any: StandardSchemaV1<any> = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }
const mp = multiplayer({ user: ({ ctx }: any) => ({ id: ctx.user?.id ?? 'guest', name: 'Me' }), relay: { ping: any } })
const room = channel({
  $id: 'mp.room',
  params: any as StandardSchemaV1<any, { id: string }>,
  authorize: () => true,
  client: mp.client as any,
  server: mp.server as any,
  on: mp.on as any,
  left: mp.left,
})

function Room() {
  const chat = room.connect({ id: 'r' })
  const typing = state(false)
  const live = presence<{ typing: boolean }>(chat as any, { state: () => ({ typing: typing.value }) })
  return (
    <>
      <p aria-label="self">{live.self.value ?? ''}</p>
      <ul>{live.peers.value.map(p => <li key={p.id}>{`${p.user.name}:${p.state?.typing}`}</li>)}</ul>
      <button onClick={() => { typing.value = !typing.value }}>type</button>
    </>
  )
}
const peer = (id: string, typing = false) => ({ id, user: { id, name: id.toUpperCase() }, state: { typing }, at: 1 })
const items = () => screen.queryAllByRole('listitem').map(li => li.textContent)

test('hello on join, and the server names this connection', async () => {
  render(Room, {})
  await net.settle()
  expect(net.sent(room as any).some(s => s.name === 'mp.hello')).toBe(true)
  expect(screen.getByLabelText('self').textContent).toMatch(/\w/)
})

test('peers arrive, change and go', async () => {
  render(Room, {})
  await net.settle()
  await net.publish(room as any, { id: 'r' }, 'mp.peer', peer('b'))
  await net.settle()
  expect(items()).toEqual(['B:false'])
  await net.publish(room as any, { id: 'r' }, 'mp.peer', peer('b', true))
  await net.publish(room as any, { id: 'r' }, 'mp.peer', peer('c'))
  await net.settle()
  expect(items()).toEqual(['B:true', 'C:false'])
  await net.publish(room as any, { id: 'r' }, 'mp.gone', { id: 'b' })
  await net.settle()
  expect(items()).toEqual(['C:false'])
})

test('a state change is sent, coalesced', async () => {
  render(Room, {})
  await net.settle()
  const before = net.sent(room as any).length
  screen.getByRole('button', { name: 'type' }).click()
  screen.getByRole('button', { name: 'type' }).click()
  screen.getByRole('button', { name: 'type' }).click()
  await new Promise(ok => setTimeout(ok, 100))
  await net.settle()
  const after = net.sent(room as any).slice(before).filter(s => s.name === 'mp.state')
  expect(after).toHaveLength(1)
  expect(after[0].msg).toEqual({ state: { typing: true } })
})

test('someone asking gets an answer addressed to them', async () => {
  render(Room, {})
  await net.settle()
  await net.publish(room as any, { id: 'r' }, 'mp.ask', { id: 'b' })
  await net.settle()
  expect(net.sent(room as any).filter(s => s.name === 'mp.answer')[0].msg).toEqual({ to: 'b', state: { typing: false } })
})

test('the roster keeps one entry per connection, and ages out the silent', () => {
  expect(applyPeer([peer('a')], peer('a', true))).toEqual([peer('a', true)])
  const list = [{ ...peer('a'), at: 100 }, { ...peer('b'), at: 900 }]
  expect(expire(list, 1000, 500).map(p => p.id)).toEqual(['b'])
  expect(expire(list, 1000, 5000)).toBe(list)
})

test('a frame off a transport is read as hostile', () => {
  expect(readCursor('{"x":0.1,"y":0.2}')).toEqual({ x: 0.1, y: 0.2 })
  expect(readCursor('null')).toBeNull()
  expect(readCursor('{"x":99,"y":0}')).toBeUndefined()
  expect(readCursor('"x"')).toBeUndefined()
  expect(readCursor('{')).toBeUndefined()
  expect(readCursor('{"x":0,"y":0,"a":1}')).toBeUndefined()
})

test('a position reads the same on a screen of another size', () => {
  const el = document.body.appendChild(document.createElement('div'))
  el.setAttribute('data-anchor', 'card "1"')
  el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 }) as DOMRect
  const at = locate(el, 150, 100, 'data-anchor', { width: 1000, height: 1000 })
  expect(at).toEqual({ a: 'card "1"', x: 0.25, y: 0.5 })
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 }) as DOMRect
  expect(resolve(at, 'data-anchor', { width: 300, height: 300 })).toEqual({ left: 100, top: 100 })
  expect(resolve({ a: 'gone', x: 0, y: 0 })).toBeNull()
  expect(resolve({ x: 0.5, y: 0.25 }, 'data-anchor', { width: 300, height: 400 })).toEqual({ left: 150, top: 100 })
  expect(locate(null, 150, 100, 'data-anchor', { width: 300, height: 200 })).toEqual({ x: 0.5, y: 0.5 })
  el.remove()
})

test('a peer gets one colour', () => {
  expect(hue('ana')).toBe(hue('ana'))
  expect(hue('ana')).toBeLessThan(360)
})

function Relay() {
  const chat = room.connect({ id: 'r' })
  const r = relay<{ ping: { at: string } }>(chat as any)
  const got = state('')
  r.on('ping', e => { got.value = `${e.peer}:${e.data.at}` })
  return <p aria-label="got">{got.value}</p>
}

test('the relay calls a typed handler', async () => {
  render(Relay, {})
  await net.settle()
  await net.publish(room as any, { id: 'r' }, 'mp.relay', { id: 'b', kind: 'ping', data: { at: 'x' } })
  await net.settle()
  expect(screen.getByLabelText('got').textContent).toBe('b:x')
})

function Pointers() {
  const chat = room.connect({ id: 'r' })
  const live = presence(chat as any)
  const c = cursors(live)
  return <ol>{c.list.value.map(x => <li key={x.id}>{`${x.id}:${x.left}`}</li>)}</ol>
}

test('another cursor shows, and goes with its peer', async () => {
  window.innerWidth = 1000
  render(Pointers, {})
  await net.settle()
  await net.publish(room as any, { id: 'r' }, 'mp.cursor', { id: 'b', at: { x: 0.5, y: 0.5 } })
  await net.settle()
  expect(items()).toEqual(['b:500'])
  await net.publish(room as any, { id: 'r' }, 'mp.gone', { id: 'b' })
  await net.settle()
  expect(items()).toEqual([])
})
