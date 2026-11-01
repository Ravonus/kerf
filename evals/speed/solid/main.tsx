import '../shared/page.css'
import { batch, createSelector, createSignal, For, untrack, type Signal } from 'solid-js'
import { render } from 'solid-js/web'
import { adjectives, colors, nouns, random } from '../shared/words.js'
import { expose, glyph, query } from '../shared/driver.js'

let cells: Signal<number>[] = []
let dispose: () => void
const batched = query.has('batch') // `?batch` gives Solid `batch()` around a tick; the table keeps whichever of the two is faster

function Cell(props: { i: number }) {
  return <i>{glyph(cells[props.i][0]())}</i>
}

function Grid() {
  return <div data-grid><For each={cells}>{(_, i) => <Cell i={untrack(i)} />}</For></div>
}

const tick = (k: number, step: number) => {
  for (let i = k % step; i < cells.length; i += step) cells[i][1](v => v + 1)
}

// js-framework-benchmark's Solid entry, without its buttons.
type Row = { id: number; label: () => string; setLabel: (fn: (l: string) => string) => void }
let nextId = 1
const buildData = (count: number): Row[] => {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(`${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`)
    data[i] = { id: nextId++, label, setLabel: setLabel as Row['setLabel'] }
  }
  return data
}
const [data, setData] = createSignal<Row[]>([])
const [selected, setSelected] = createSignal<number | null>(null)

const rows = {
  run: () => void setData(buildData(1_000)),
  runLots: () => void setData(buildData(10_000)),
  add: () => void setData(d => [...d, ...buildData(1_000)]),
  update: () => batch(() => {
    const d = data()
    for (let i = 0; i < d.length; i += 10) d[i].setLabel(l => l + ' !!!')
  }),
  clear: () => void setData([]),
  few: () => void setData(buildData(8)),
  rotate: () => void setData(d => [...d.slice(1), d[0]]),
  swap: () => {
    const list = data().slice()
    if (list.length > 998) {
      const item = list[1]
      list[1] = list[998]
      list[998] = item
      setData(list)
    }
  },
  select: (k: number) => void setSelected(data()[k].id),
  remove: (k: number) => {
    const id = data()[k].id
    setData(d => d.filter(r => r.id !== id))
  },
}

function Main() {
  const isSelected = createSelector(selected)
  return (
    <table class="table table-hover table-striped test-data">
      <tbody>
        <For each={data()}>{row => {
          const id = row.id
          return (
            <tr class={isSelected(id) ? 'danger' : ''}>
              <td class="col-md-1" textContent={id} />
              <td class="col-md-4">
                <a onClick={[setSelected, id]} textContent={row.label()} />
              </td>
              <td class="col-md-1">
                <a onClick={() => rows.remove(data().indexOf(row))}>
                  <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                </a>
              </td>
              <td class="col-md-6" />
            </tr>
          )
        }}</For>
      </tbody>
    </table>
  )
}

expose({
  grid: {
    mount(n: number, root: Element) {
      cells = Array.from({ length: n }, () => createSignal(0))
      dispose = render(() => <Grid />, root)
    },
    tick: batched ? (k: number, step: number) => batch(() => tick(k, step)) : tick,
    unmount: () => dispose(),
    check: () => cells.reduce((sum, c) => sum + c[0](), 0),
  },
  rows: { ...rows, setup: (root: Element) => void render(() => <Main />, root) },
})
