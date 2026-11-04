import { createSignal, For, untrack } from 'solid-js'
import { render } from 'solid-js/web'
import { CELLS, count, glyph, harness } from '../shared/harness.js'

const ran = <T,>(v: T) => (count.runs++, v)
const [n, setN] = createSignal(0)
const cells = Array.from({ length: CELLS }, () => createSignal(0))

function Counter() {
  count.renders++
  return (
    <button type="button" onClick={() => window.arena.press()}>
      {ran(n())}
    </button>
  )
}

function Cell(props: { i: number }) {
  count.renders++
  return <i>{ran(glyph(cells[props.i][0]()))}</i>
}

function Grid() {
  count.renders++
  return (
    <div data-grid>
      <For each={cells}>
        {(_, i) => {
          const index = untrack(i)
          return <Cell i={index} />
        }}
      </For>
    </div>
  )
}

const tick = (k: number) => {
  for (let i = k % 10; i < CELLS; i += 10) cells[i][1]((v) => v + 1)
}

const root = document.getElementById('root')!
render(
  () => (
    <main>
      <Counter />
      <Grid />
    </main>
  ),
  root,
)
harness(root, { click: () => setN((v) => v + 1), tick, runs: () => count.runs })
