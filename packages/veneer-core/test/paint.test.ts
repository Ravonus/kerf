import { expect, it } from 'vitest'
import { flat, hex, ramp, Raster } from '../src/paint'

const R = ramp('#100000', '#400000', '#800000', '#c00000', '#ff0000')
const at = (r: Raster, x: number, y: number) => r.px[y * r.w + x]!

it('a shape takes one band of its ramp per cell, never a dithered mix', () => {
  const r = new Raster(20, 20, { brush: 0 })
  r.rect({ x: 0, y: 0, w: 20, h: 20 }, { ramp: R, shade: flat(0.45) })
  const used = new Set(r.px)
  expect(used.size).toBe(1)
  expect(used.has(R[2]!)).toBe(true)
})

it('the brush bends the seams between bands but keeps every cell a ramp colour', () => {
  const ruled = new Raster(40, 8, { brush: 0 })
  const brushed = new Raster(40, 8)
  for (const r of [ruled, brushed])
    r.rect({ x: 0, y: 0, w: 40, h: 8 }, { ramp: R, shade: (u) => (u + 1) / 2 })
  const columns = (r: Raster) =>
    [...Array(40).keys()].map((x) => [...Array(8).keys()].map((y) => at(r, x, y)))
  // ruled: every column one colour; brushed: some seam cells lean into the next column's band
  expect(columns(ruled).every((c) => new Set(c).size === 1)).toBe(true)
  expect(columns(brushed).some((c) => new Set(c).size > 1)).toBe(true)
  expect([...brushed.px].every((c) => R.includes(c))).toBe(true)
})

it('outline rings a shape one cell outside in a darker shade; a bare mark gets none', () => {
  const r = new Raster(12, 12)
  r.ellipse({ x: 6, y: 6, rx: 3, ry: 3 }, { ramp: R })
  r.dot([1, 1], R, 1, { bare: true })
  r.outline()
  expect(at(r, 6, 2)).not.toBe(0) // the ring above the ball
  expect(at(r, 0, 1)).toBe(0) // nothing round the bare dot
})

it('a ground shadow sits under what is painted, a darker core in a lighter rim', () => {
  const r = new Raster(30, 10)
  r.dot([15, 5], R, 1)
  r.shadow({ x: 15, y: 5, rx: 12, ry: 4 }, hex('#000000'))
  expect(at(r, 15, 5)).toBe(R[4]) // the dot stays
  expect(at(r, 14, 5) >>> 24).toBeGreaterThan(at(r, 25, 5) >>> 24)
})

it('at() places and scales the painter space', () => {
  const r = new Raster(20, 20).at(10, 10, 2)
  r.dot([1, 1], R, 1, { bare: true })
  expect(at(r, 12, 12)).toBe(R[4])
  expect(r.painted(1, 1)).toBe(true)
})
