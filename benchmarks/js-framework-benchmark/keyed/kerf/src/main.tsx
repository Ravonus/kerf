import { state } from '@kerf/core'
import { For, render } from '@kerf/core/dom'
import { makeRows, type Row } from './data'

type Actions = {
  create: (count: number) => void
  add: () => void
  update: () => void
  clear: () => void
  swap: () => void
}

function Header(props: Actions) {
  return (
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>kerf-keyed</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <div class="col-sm-6 smallpad">
              <button
                type="button"
                class="btn btn-primary btn-block"
                id="run"
                onClick={() => props.create(1000)}
              >
                Create 1,000 rows
              </button>
            </div>
            <div class="col-sm-6 smallpad">
              <button
                type="button"
                class="btn btn-primary btn-block"
                id="runlots"
                onClick={() => props.create(10000)}
              >
                Create 10,000 rows
              </button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="add" onClick={props.add}>
                Append 1,000 rows
              </button>
            </div>
            <div class="col-sm-6 smallpad">
              <button
                type="button"
                class="btn btn-primary btn-block"
                id="update"
                onClick={props.update}
              >
                Update every 10th row
              </button>
            </div>
            <div class="col-sm-6 smallpad">
              <button
                type="button"
                class="btn btn-primary btn-block"
                id="clear"
                onClick={props.clear}
              >
                Clear
              </button>
            </div>
            <div class="col-sm-6 smallpad">
              <button
                type="button"
                class="btn btn-primary btn-block"
                id="swaprows"
                onClick={props.swap}
              >
                Swap Rows
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const rows = state<Row[]>([])
  const selected = state<number | null>(null)
  const create = (count: number) => {
    rows.value = makeRows(count)
    selected.value = null
  }
  const update = () => {
    rows.value = rows.value.map((row, index) =>
      index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
    )
  }
  const swap = () => {
    if (rows.value.length <= 998) return
    const next = rows.value.slice()
    ;[next[1], next[998]] = [next[998]!, next[1]!]
    rows.value = next
  }
  const remove = (id: number) => {
    rows.value = rows.value.filter((row) => row.id !== id)
  }
  return (
    <div class="container">
      <Header
        create={create}
        add={() => (rows.value = rows.value.concat(makeRows(1000)))}
        update={update}
        clear={() => {
          rows.value = []
          selected.value = null
        }}
        swap={swap}
      />
      <table class="table table-hover table-striped test-data">
        <tbody id="tbody">
          <For each={rows.value} by={(row) => row.id}>
            {(row) => (
              <tr class={selected.value === row().id ? 'danger' : ''}>
                <td class="col-md-1">{row().id}</td>
                <td class="col-md-4">
                  <a onClick={() => (selected.value = row().id)}>{row().label}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => remove(row().id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                  </a>
                </td>
                <td class="col-md-6"></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  )
}

render(() => <App />, document.getElementById('main')!)
