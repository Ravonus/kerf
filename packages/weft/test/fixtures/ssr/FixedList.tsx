// A list over an array nothing re-reads: a plain `.map`, with live cells.
import { state } from '@weft-js/core'

const cells = Array.from({ length: 3 }, (_, i) => state(i))

function Cell(props: { i: number }) {
  return <i>{cells[props.i].value}</i>
}

export const write = (i: number, v: number) => { cells[i].value = v }

export function Grid() {
  return <div>{cells.map((_, i) => <Cell i={i} />)}</div>
}
