import { memo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CELLS, count, glyph, harness } from '../shared/harness.js'

let bump: () => void
let setAll: (fn: (cells: number[]) => number[]) => void

function Counter() {
  count.renders++
  const [n, set] = useState(0)
  bump = () => flushSync(() => set(v => v + 1))
  return <button type="button" onClick={() => window.arena.press()}>{n}</button>
}

const Cell = memo(function Cell({ value }: { value: number }) {
  count.renders++
  return <i>{glyph(value)}</i>
})

function Grid() {
  count.renders++
  const [cells, set] = useState(() => new Array<number>(CELLS).fill(0))
  setAll = set
  return <div data-grid>{cells.map((value, i) => <Cell key={i} value={value} />)}</div>
}

const tick = (k: number) => flushSync(() => setAll(cells => cells.map((v, i) => (i % 10 === k % 10 ? v + 1 : v))))

const root = document.getElementById('root')!
flushSync(() => createRoot(root).render(<main><Counter /><Grid /></main>))
harness(root, { click: () => bump(), tick, runs: () => 0 })
