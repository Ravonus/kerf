// The page scripts/virtual.mjs drives: each view with `?n=` items, in a real browser.
import '../../../plugin-text/node_modules/@fontsource/inter/latin-400.css'
import '../../../plugin-text/node_modules/@fontsource/inter/latin-500.css'
import '../../../plugin-text/node_modules/@fontsource/inter/latin-600.css'
import { state } from 'weft'
import { render } from 'weft/dom'
import type { ChatMessage } from '@weft/ui-core'
import { Feed, Kanban, ScrollGrid, Thread, Toaster, VirtualList, type KanbanCardData, type KanbanColumn, type VirtualControl } from '../../src/index'

const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'list', n = Number(q.get('n') ?? 10000)
const WORDS = 'amber basalt cedar dune ember fjord grove heath inlet jade kelp loam marsh nectar opal pine quartz reed sage tundra umber vale willow xenon yarrow zephyr wrote about the long way home before morning and then again'.split(' ')
const rand = (i: number, k: number) => ((i + 1) * 2654435761 + k * 40503) >>> 7
const sentence = (i: number, most = 60) => Array.from({ length: 3 + rand(i, 1) % most }, (_, k) => WORDS[rand(i, k + 2) % WORDS.length]).join(' ')

const drift: [number, number, number][] = []
const w = window as any
w.drift = drift
const onDrift = (i: number, p: number, a: number) => { if (Math.abs(p - a) > 1) drift.push([i, p, a]) }
const take = (c: VirtualControl) => (w.control = c)

function List() {
  const items = state(Array.from({ length: n }, (_, i) => ({ id: i, text: sentence(i) })))
  w.items = items
  return (
    <VirtualList label="Rows" height="600px" items={items.value} rowKey={r => r.id} text={r => r.text} estimate={60} onDrift={onDrift} control={take}>
      {r => <p data-measure="" style="margin:0;line-height:22px">{r().text}</p>}
    </VirtualList>
  )
}

const people = ['Mei', 'Ana', 'Kofi', 'Sam']
const peer = (name: string) => ({ id: name, name })
const message = (i: number): ChatMessage => ({ id: `m${i}`, author: peer(i % 5 === 0 ? 'Me' : people[rand(i, 0) % 4]), mine: i % 5 === 0, text: sentence(i), time: '09:41', at: i * 200000, day: `Day ${Math.floor(i / 400)}`, state: i % 5 === 0 ? 'sent' : undefined })

function Chat() {
  let low = 0
  const all = state(Array.from({ length: n }, (_, i) => message(i)))
  w.messages = all
  w.older = (k: number) => { const add = Array.from({ length: k }, (_, i) => message(--low + n * 2 + i * 0)); all.value = [...add.reverse().map((m, i) => ({ ...m, id: `o${low}-${i}` })), ...all.value] }
  w.stream = () => { all.value = [...all.value, { id: 's', author: peer('Mei'), text: '', time: '09:42', at: n * 200000, streaming: true }] }
  w.append = (text: string, author = 'Mei') => { all.value = all.value.map(m => (m.id === 's' ? { ...m, text: m.text + text } : m)) ; void author }
  w.say = (text: string, author = 'Mei') => { all.value = [...all.value, { id: `x${all.value.length}`, author: peer(author), mine: author === 'Me', text, time: '09:43', at: Date.now() * 2 }] }
  return <div style="block-size:640px"><Thread label="# calendar-engine" header={<b># calendar-engine</b>} messages={all} onSend={m => w.say(m.text, 'Me')} onDrift={onDrift} control={take} /></div>
}

function FeedView() {
  const items = state(Array.from({ length: n }, (_, i) => ({ id: i, what: `Item ${i}`, when: '2h', detail: sentence(i, 40) })))
  return <Feed label="Activity" height="600px" items={items.value} onDrift={onDrift} control={take} />
}

function Board() {
  const cols = ['Backlog', 'Doing', 'Review', 'Done']
  const lists = state<KanbanColumn[]>(cols.map((title, c) => ({ id: title.toLowerCase(), title, limit: c === 1 ? 100 : undefined, cards: Array.from({ length: Math.floor(n / 4) }, (_, i): KanbanCardData => ({ id: `c${c}-${i}`, title: sentence(i + c * n, 14), meta: i % 3 ? 'Ana · Friday' : undefined })) })))
  return <Kanban label="Sprint" columns={lists} onDrift={onDrift} />
}

function Grid() {
  const wrap = q.get('wrap') === '1'
  const columns = Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, header: `Day ${i + 1}`, wrap: wrap && i === 1, width: wrap && i === 1 ? 220 : undefined }))
  return <ScrollGrid label="Daily metrics" corner="Metric \ day" height="560px" rows={n} columns={columns} rowHeader={r => `Metric ${r + 1}`} cell={(r, c) => (c.wrap ? sentence(r, 30) : String(rand(r, c.id.length + Number(c.id.slice(1))) % 1000))} negative={(r, c) => r % 7 === 0 && c.id === 'c2'} />
}

const views: Record<string, () => any> = { list: List, chat: Chat, feed: FeedView, kanban: Board, grid: Grid }
const View = views[view]
render(() => <><Toaster /><View /></>, document.getElementById('root')!)
