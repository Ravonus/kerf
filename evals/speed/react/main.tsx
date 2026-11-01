import '../shared/page.css'
import { memo, useState, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { adjectives, colors, nouns, random } from '../shared/words.js'
import { expose, glyph } from '../shared/driver.js'

let setAll: (fn: (cells: number[]) => number[]) => void
let latest: number[] = []
let start = 0
let root: Root | undefined

const Cell = memo(function Cell({ value }: { value: number }) {
  return <i>{glyph(value)}</i>
})

function Grid() {
  const [cells, set] = useState(() => new Array<number>(start).fill(0))
  setAll = set
  latest = cells
  return <div data-grid>{cells.map((value, i) => <Cell key={i} value={value} />)}</div>
}

// js-framework-benchmark's keyed React entry (hooks, a memoised row), without its buttons.
type Item = { id: number; label: string }
let nextId = 1
const buildData = (count: number): Item[] => {
  const data = new Array<Item>(count)
  for (let i = 0; i < count; i++)
    data[i] = { id: nextId++, label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}` }
  return data
}
let list: Item[] = []
let selected = 0
const seen = new Set<() => void>()
const put = (next: Item[], pick = selected) => {
  list = next
  selected = pick
  flushSync(() => { for (const f of seen) f() })
}
const subscribe = (f: () => void) => (seen.add(f), () => void seen.delete(f))
let version = 0
const bump = () => version
const notify = (next: Item[], pick?: number) => { version++; put(next, pick) }

const Row = memo(function Row({ item, on }: { item: Item; on: boolean }) {
  return (
    <tr className={on ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4"><a onClick={() => notify(list, item.id)}>{item.label}</a></td>
      <td className="col-md-1">
        <a onClick={() => rows.remove(list.indexOf(item))}><span className="glyphicon glyphicon-remove" aria-hidden="true" /></a>
      </td>
      <td className="col-md-6" />
    </tr>
  )
})

function Main() {
  useSyncExternalStore(subscribe, bump)
  return (
    <table className="table table-hover table-striped test-data">
      <tbody>{list.map(item => <Row key={item.id} item={item} on={item.id === selected} />)}</tbody>
    </table>
  )
}

const rows = {
  run: () => notify(buildData(1_000)),
  runLots: () => notify(buildData(10_000)),
  add: () => notify([...list, ...buildData(1_000)]),
  update: () => {
    const next = list.slice()
    for (let i = 0; i < next.length; i += 10) next[i] = { ...next[i], label: next[i].label + ' !!!' }
    notify(next)
  },
  clear: () => notify([]),
  swap: () => {
    if (list.length > 998) {
      const next = list.slice()
      const item = next[1]
      next[1] = next[998]
      next[998] = item
      notify(next)
    }
  },
  select: (k: number) => notify(list, list[k].id),
  remove: (k: number) => {
    const id = list[k].id
    notify(list.filter(r => r.id !== id))
  },
}

expose({
  grid: {
    mount(n: number, at: Element) {
      start = n
      root = createRoot(at)
      flushSync(() => root!.render(<Grid />))
    },
    tick: (k: number, step: number) => flushSync(() => setAll(cells => cells.map((v, i) => (i % step === k % step ? v + 1 : v)))),
    unmount: () => flushSync(() => root!.unmount()),
    check: () => latest.reduce((sum, c) => sum + c, 0),
  },
  rows: { ...rows, setup: (at: Element) => flushSync(() => createRoot(at).render(<Main />)) },
})
