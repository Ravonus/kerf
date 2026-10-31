// The collections driven as a user would, on a deterministic `text.measure`. Real scrolling and real line breaks are in
// scripts/virtual.mjs: jsdom has no layout.
import { fireEvent } from '@testing-library/dom'
import { state } from 'weft'
import { fakeMeasure, flush, render } from 'weft/test'
import { Feed } from '../src/Feed'
import { Kanban, type KanbanCard } from '../src/Kanban'
import { ScrollGrid } from '../src/ScrollGrid'
import { Thread, type ThreadMessage } from '../src/Thread'
import { VirtualList, type VirtualControl } from '../src/VirtualList'

const settle = async () => { for (let i = 0; i < 4; i++) { await flush(); await new Promise(r => setTimeout(r)) } }
const slots = { slots: { 'text.measure': fakeMeasure() } }
const rows = (c: Element) => [...c.querySelectorAll<HTMLElement>('[data-part="row"]:not([data-probe])')]

test('VirtualList: 10,000 items, a window of rows, each saying where it is in the whole', async () => {
  const items = Array.from({ length: 10000 }, (_, i) => ({ id: i, text: `row ${i}` }))
  const { container: c } = render(() => <VirtualList label="Rows" items={items} rowKey={r => r.id}>{r => <span>{r().text}</span>}</VirtualList>)
  await settle()
  const out = rows(c)
  expect(out.length).toBeGreaterThan(0)
  expect(out.length).toBeLessThan(40)
  expect(out[0].getAttribute('aria-posinset')).toBe('1')
  expect(out[0].getAttribute('aria-setsize')).toBe('10000')
  expect(c.querySelector('[role="list"]')!.getAttribute('aria-label')).toBe('Rows')
})

test('VirtualList: renders its first rows with no browser layout at all (the server)', async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }))
  const { container: c } = render(() => <VirtualList items={items} rowKey={r => r.id} initial={5}>{r => <span>{r().id}</span>}</VirtualList>)
  expect(rows(c).length).toBeLessThanOrEqual(5)
  await settle()
})

test('VirtualList: a row with the same key keeps its node when its data changes and when rows arrive above', async () => {
  const items = state(Array.from({ length: 50 }, (_, i) => ({ id: i, text: `row ${i}` })))
  const { container: c } = render(() => <VirtualList items={items.value} rowKey={r => r.id}>{r => <span>{r().text}</span>}</VirtualList>)
  await settle()
  const first = rows(c)[0]
  items.value = [{ id: -1, text: 'new' }, ...items.value.map(r => (r.id === 0 ? { ...r, text: 'changed' } : r))]
  await settle()
  expect(first.isConnected).toBe(true)
  expect(first.textContent).toBe('changed')
  expect(first.getAttribute('aria-posinset')).toBe('2')
})

test('VirtualList: the focused row stays rendered, and keys move a single tab stop', async () => {
  let control!: VirtualControl
  const items = Array.from({ length: 2000 }, (_, i) => ({ id: i }))
  const { container: c } = render(() => <VirtualList roving items={items} rowKey={r => r.id} control={k => (control = k)}>{r => <span>{r().id}</span>}</VirtualList>)
  await settle()
  expect(rows(c).filter(r => r.tabIndex === 0)).toHaveLength(1)
  control.focus(1500)
  await settle()
  const held = c.querySelector<HTMLElement>('[aria-posinset="1501"]')!
  expect(document.activeElement).toBe(held)
  fireEvent.keyDown(held, { key: 'ArrowDown' })
  await settle()
  expect(document.activeElement!.getAttribute('aria-posinset')).toBe('1502')
  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  await settle()
  expect(document.activeElement!.getAttribute('aria-posinset')).toBe('1')
})

const chat = (n: number): ThreadMessage[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, author: i % 4 === 3 ? 'Me' : 'Mei', text: `hello ${i}`, time: '09:41', at: i * 1000, day: 'Today', state: i % 4 === 3 ? 'sent' as const : undefined }))

test('Thread: its live region is off, so scrolling announces nothing; a new message is said once, by name', async () => {
  const messages = state(chat(200))
  const { container: c } = render(() => <Thread label="Team" me="Me" messages={messages.value} />, {}, slots)
  await settle()
  expect(c.querySelector('[role="log"]')!.getAttribute('aria-live')).toBe('off')
  expect(c.querySelector('[role="log"] [role="article"]')!.getAttribute('aria-setsize')).toBe('-1')
  messages.value = [...messages.value, { id: 'n', author: 'Ana', text: 'hi', at: 1e9 }]
  await settle()
  expect(c.querySelector('[role="status"]')!.textContent).toBe('New message from Ana')
})

test('Thread: messages from one author group, mine carry a status, and a failed one offers Retry', async () => {
  const retried: string[] = []
  const messages = [...chat(3), { id: 'f', author: 'Me', text: 'oops', state: 'failed' as const, at: 9000 }]
  const { container: c } = render(() => <Thread label="Team" me="Me" messages={messages} onRetry={m => retried.push(m.id)} />, {}, slots)
  await settle()
  expect(c.querySelectorAll('[data-part="row"]:not([data-probe]) [data-scope="message"][data-continued]')).toHaveLength(2)
  const button = [...c.querySelectorAll('button')].find(b => b.textContent === 'Retry')!
  button.click()
  expect(retried).toEqual(['f'])
})

test('Thread: Enter sends and clears, Shift+Enter does not', async () => {
  const sent: string[] = []
  const { container: c } = render(() => <Thread label="Team" me="Me" messages={chat(3)} onSend={t => sent.push(t)} />, {}, slots)
  await settle()
  const box = c.querySelector('textarea')!
  box.value = 'hello'
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(sent).toEqual([])
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(sent).toEqual(['hello'])
  expect(box.value).toBe('')
})

test('Thread: a streaming message renders through <Text stream>', async () => {
  const messages = state<ThreadMessage[]>([{ id: 's', author: 'Mei', text: 'He', streaming: true }])
  const { container: c } = render(() => <Thread label="Team" me="Me" messages={messages.value} />, {}, slots)
  await settle()
  expect(c.querySelector('[data-block="tail"]')).not.toBeNull()
})

test('Feed: role=feed over articles, Page Down moves between them', async () => {
  const items = Array.from({ length: 300 }, (_, i) => ({ id: i, what: `Item ${i}`, detail: 'details' }))
  const { container: c } = render(() => <Feed label="Activity" items={items} />, {}, slots)
  await settle()
  expect(c.querySelector('[role="feed"]')!.getAttribute('aria-label')).toBe('Activity')
  const first = rows(c)[0]
  expect(first.getAttribute('role')).toBe('article')
  first.focus()
  fireEvent.keyDown(first, { key: 'PageDown' })
  await settle()
  expect(document.activeElement!.getAttribute('aria-posinset')).toBe('2')
})

test('Feed: asks for more near the end, once per length', async () => {
  const ends: number[] = []
  const items = Array.from({ length: 5 }, (_, i) => ({ id: i, what: `Item ${i}` }))
  render(() => <Feed label="Activity" items={items} onEnd={() => ends.push(1)} />, {}, slots)
  await settle()
  expect(ends).toHaveLength(1)
})

function board() {
  const columns = state(['Todo', 'Doing'].map(id => ({ id, title: id, limit: id === 'Doing' ? 1 : undefined, cards: Array.from({ length: 3 }, (_, i): KanbanCard => ({ id: `${id}${i}`, title: `${id} card ${i}` })) })))
  const moves: [string, string, number][] = []
  const onMove = (card: KanbanCard, to: string, index: number) => {
    moves.push([card.id, to, index])
    columns.value = columns.value.map(c => {
      const rest = c.cards.filter(x => x.id !== card.id)
      return c.id === to ? { ...c, cards: [...rest.slice(0, index), card, ...rest.slice(index)] } : { ...c, cards: rest }
    })
  }
  return { columns, moves, onMove }
}

test('Kanban: Alt+→ moves a card across, focus goes with it', async () => {
  const b = board()
  const { container: c } = render(() => <Kanban label="Sprint" columns={b.columns.value} onMove={b.onMove} />, {}, slots)
  await settle()
  const card = c.querySelector<HTMLElement>('[data-part="card"]')!
  card.focus()
  fireEvent.keyDown(card, { key: 'ArrowRight', altKey: true })
  await settle()
  expect(b.moves).toEqual([['Todo0', 'Doing', 0]])
  expect(document.activeElement!.textContent).toContain('Todo card 0')
  expect(document.activeElement!.closest('[data-part="column"]')!.getAttribute('aria-label')).toBe('Doing')
})

test('Kanban: the Move menu lists every column; a count past its limit is marked', async () => {
  const b = board()
  const { container: c } = render(() => <Kanban label="Sprint" columns={b.columns.value} onMove={b.onMove} />, {}, slots)
  await settle()
  expect(c.querySelector('[data-part="column"][aria-label="Doing"] [data-part="count"]')!.hasAttribute('data-over')).toBe(true)
  c.querySelector<HTMLElement>('[data-part="move"]')!.click()
  await settle()
  const items = [...c.querySelectorAll<HTMLElement>('[data-part="row"]:not([data-probe]) [role="menuitem"]')]
  expect(items.map(i => i.textContent)).toEqual(['Todo', 'Doing', 'Move up', 'Move down'])
  items[1].click()
  await settle()
  expect(b.moves).toEqual([['Todo0', 'Doing', 0]])
})

test('ScrollGrid: APG structure, and the active cell survives as a real node', async () => {
  const columns = Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, header: `Day ${i + 1}` }))
  const { container: c } = render(() => <ScrollGrid label="Metrics" rows={2000} columns={columns} rowHeader={r => `M${r}`} cell={(r, col) => `${r}:${col.id}`} />)
  await settle()
  const grid = c.querySelector<HTMLElement>('[role="grid"]')!
  expect(grid.getAttribute('aria-rowcount')).toBe('2001')
  expect(grid.getAttribute('aria-colcount')).toBe('121')
  expect(c.querySelectorAll('[role="gridcell"]').length).toBeLessThan(800)
  expect(c.querySelector('[role="columnheader"]')!.getAttribute('aria-colindex')).toBe('1')
  fireEvent.keyDown(grid, { key: 'ArrowDown' })
  fireEvent.keyDown(grid, { key: 'ArrowRight' })
  await settle()
  expect(document.getElementById(grid.getAttribute('aria-activedescendant')!)!.textContent).toBe('1:c1')
  fireEvent.keyDown(grid, { key: 'End', ctrlKey: true })
  await settle()
  const cell = document.getElementById(grid.getAttribute('aria-activedescendant')!)!
  expect(cell.textContent).toBe('1999:c119')
  expect(cell.hasAttribute('data-active')).toBe(true)
})
