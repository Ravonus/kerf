import '../shared/page.css'
import { flush, state, type State } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'
import { expose, glyph } from '../shared/driver.js'
import { Main, rows } from './rows'

let cells: State<number>[] = []
let dispose: () => void

function Cell(props: { i: number }) {
  return <i>{glyph(cells[props.i].value)}</i>
}

function Grid() {
  return (
    <div data-grid>
      {cells.map((_, i) => (
        <Cell i={i} />
      ))}
    </div>
  )
}

expose({
  grid: {
    mount(n: number, root: Element) {
      cells = Array.from({ length: n }, () => state(0))
      dispose = render(() => <Grid />, root)
    },
    tick(k: number, step: number) {
      for (let i = k % step; i < cells.length; i += step) cells[i].value++
      flush()
    },
    unmount: () => dispose(),
    check: () => cells.reduce((sum, c) => sum + c.value, 0),
  },
  rows: { ...rows, setup: (root: Element) => void render(() => <Main />, root) },
})
