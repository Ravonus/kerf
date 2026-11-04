// The hero's field stays on its palette. The loom's shed takes light away, and a level below 0 has no colour: the canvas
// ignores it and the cell paints in whatever came before. `node test/field.mjs`.
import assert from 'node:assert/strict'
import { level, PALETTE } from '../src/lib/field.ts'

const COLS = 160,
  ROWS = 100
for (let t = 0; t < 6; t += 0.37)
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      for (const lift of [-0.09, 0, 3]) {
        const v = level(x, y, COLS, ROWS, t, lift)
        assert.ok(v >= 0 && v < PALETTE.length, `level ${v} at (${x}, ${y}), t ${t}, lift ${lift}`)
      }
    }
console.log('field: every level is on the palette')
