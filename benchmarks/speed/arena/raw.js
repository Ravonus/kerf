// The floor: the same page and the same 100 text writes, with no framework. Same harness.
import { CELLS, glyph, harness } from './harness.js'

const root = document.getElementById('root')
const main = document.createElement('main')
const button = document.createElement('button')
button.textContent = '0'
const grid = document.createElement('div')
grid.setAttribute('data-grid', '')
const texts = [],
  cells = new Array(CELLS).fill(0)
for (let i = 0; i < CELLS; i++) {
  const c = document.createElement('i')
  c.textContent = '0'
  grid.append(c)
  texts.push(c.firstChild)
}
main.append(button, grid)
root.append(main)
let n = 0
const tick = (k) => {
  for (let i = k % 10; i < CELLS; i += 10) texts[i].data = glyph(++cells[i])
}
harness(root, {
  click: () => {
    button.firstChild.data = ++n
  },
  tick,
  runs: () => 0,
})
