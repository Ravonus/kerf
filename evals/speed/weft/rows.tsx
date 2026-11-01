// The js-framework-benchmark entry, as packages/weft/test/fixtures/next/Bench.tsx has it, without its buttons.
import { flush, state, type State } from 'weft'
import { adjectives, colors, nouns, random } from '../shared/words.js'

type Row = { id: number; label: State<string> }

let nextId = 1
const buildData = (count: number): Row[] => {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++)
    data[i] = { id: nextId++, label: state(`${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`) }
  return data
}

const data = state<Row[]>([])
const selected = state<Record<number, true>>({}) // keyed reads: a select re-runs the two rows it changes
const now = (fn: () => void) => { fn(); flush() }

export const rows = {
  run: () => now(() => (data.value = buildData(1_000))),
  runLots: () => now(() => (data.value = buildData(10_000))),
  add: () => now(() => (data.value = [...data.value, ...buildData(1_000)])),
  update: () => now(() => {
    const d = data.value
    for (let i = 0; i < d.length; i += 10) d[i].label.value += ' !!!'
  }),
  clear: () => now(() => (data.value = [])),
  swap: () => now(() => {
    const list = data.value.slice()
    if (list.length > 998) {
      const item = list[1]
      list[1] = list[998]
      list[998] = item
      data.value = list
    }
  }),
  select: (k: number) => now(() => (selected.value = { [data.value[k].id]: true })),
  remove: (k: number) => now(() => {
    const id = data.value[k].id
    data.value = data.value.filter(r => r.id !== id)
  }),
}

export function Main() {
  return (
    <table class="table table-hover table-striped test-data">
      <tbody>
        {data.value.map(row => (
          <tr key={row.id} class={selected.get(row.id) ? 'danger' : ''}>
            <td class="col-md-1">{row.id}</td>
            <td class="col-md-4">
              <a onClick={() => (selected.value = { [row.id]: true })}>{row.label.value}</a>
            </td>
            <td class="col-md-1">
              <a onClick={() => rows.remove(data.value.indexOf(row))}>
                <span class="glyphicon glyphicon-remove" aria-hidden="true" />
              </a>
            </td>
            <td class="col-md-6" />
          </tr>
        ))}
      </tbody>
    </table>
  )
}
