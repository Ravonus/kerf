// The js-framework-benchmark entry (~/work/jfb/frameworks/keyed/kerf/src/main.tsx) without its render call.
import { state, type State } from '@kerf-js/core'

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"] // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"] // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"] // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max

type Row = { id: number; label: State<string> }

let nextId = 1
const buildData = (count: number): Row[] => {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++)
    data[i] = {
      id: nextId++,
      label: state(
        `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
      ),
    }
  return data
}

function Button(props: { id: string; text: string; onClick: () => void }) {
  return (
    <div class="col-sm-6 smallpad">
      <button id={props.id} class="btn btn-primary btn-block" type="button" onClick={props.onClick}>
        {props.text}
      </button>
    </div>
  )
}

export function Main() {
  const data = state<Row[]>([])
  const selected = state<Record<number, true>>({}) // keyed reads: a select re-runs the two rows it changes
  const run = () => (data.value = buildData(1_000))
  const runLots = () => (data.value = buildData(10_000))
  const add = () => (data.value = [...data.value, ...buildData(1_000)])
  const update = () => {
    const d = data.value
    for (let i = 0; i < d.length; i += 10) d[i]!.label.value += ' !!!'
  }
  const clear = () => (data.value = [])
  const swapRows = () => {
    const list = data.value.slice()
    if (list.length > 998) {
      const item = list[1]
      list[1] = list[998]!
      list[998] = item!
      data.value = list
    }
  }
  const remove = (id: number) => (data.value = data.value.filter((r) => r.id !== id))

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>kerf</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" text="Create 1,000 rows" onClick={run} />
              <Button id="runlots" text="Create 10,000 rows" onClick={runLots} />
              <Button id="add" text="Append 1,000 rows" onClick={add} />
              <Button id="update" text="Update every 10th row" onClick={update} />
              <Button id="clear" text="Clear" onClick={clear} />
              <Button id="swaprows" text="Swap Rows" onClick={swapRows} />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          {data.value.map((row) => (
            <tr key={row.id} class={selected.get(row.id) ? 'danger' : ''}>
              <td class="col-md-1">{row.id}</td>
              <td class="col-md-4">
                <a onClick={() => (selected.value = { [row.id]: true })}>{row.label.value}</a>
              </td>
              <td class="col-md-1">
                <a onClick={() => remove(row.id)}>
                  <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                </a>
              </td>
              <td class="col-md-6" />
            </tr>
          ))}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}
