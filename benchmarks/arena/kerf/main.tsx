import { flush, state } from '@kerf-js/core'
import { stats } from '@kerf-js/core/internal'
import { render } from '@kerf-js/core/dom'
import { CELLS, count, glyph, harness } from '../shared/harness.js'

const n = state(0)
const cells = Array.from({ length: CELLS }, () => state(0))

function Counter() {
  count.renders++
  return (
    <button type="button" onClick={() => window.arena.press()}>
      {n.value}
    </button>
  )
}

function Cell(props: { i: number }) {
  count.renders++
  return <i>{glyph(cells[props.i].value)}</i>
}

function Grid() {
  count.renders++
  return (
    <div data-grid>
      {cells.map((_, i) => (
        <Cell i={i} />
      ))}
    </div>
  )
}

const tick = (k: number) => {
  for (let i = k % 10; i < CELLS; i += 10) cells[i].value++
  flush()
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
harness(root, {
  click: () => {
    n.value++
    flush()
  },
  tick,
  runs: () => stats.runs,
})
