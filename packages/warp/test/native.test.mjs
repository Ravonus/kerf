// Warp draws its own controls: nothing in the kit may hand one back to the browser. Real <input> and <textarea> stay (the
// OS owns editing), as do the elements warp paints over; those are listed with why.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const src = join(import.meta.dirname, '../src')
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []
  })
const files = walk(src).map((p) => [relative(src, p), readFileSync(p, 'utf8')])
const hits = (re) =>
  files.flatMap(([name, text]) => [...text.matchAll(re)].map((m) => `${name}: ${m[0]}`))

test('the only <select> is the one Select hides as its form value', () => {
  expect(hits(/<select(?=\s)/g)).toEqual(['Select.tsx: <select'])
})

test('no input type the browser paints', () => {
  const left = hits(
    /<input\b[^>]*\btype="(date|datetime-local|time|month|week|number|range|color)"/g,
  )
  expect(left).toEqual([])
  expect(hits(/<Input\b[^>]*\btype="number"/g)).toEqual([])
})

test('checkboxes and radios are warp painted', () => {
  // every one sits inside a warp host (Choice), or is hidden with opacity by its own scope's CSS
  const painted =
    /^(Choice|Table|SignaturePad|Calendar|schedule\/Calendar|live\/TransportPicker|admin\/Plans|admin\/Checkout)\.tsx/
  expect(hits(/<input\b[^>]*\btype="(checkbox|radio)"/g).filter((h) => !painted.test(h))).toEqual(
    [],
  )
})

test('no title tooltips: a frame keeps its title, since that is its name', () => {
  expect(hits(/<(?!iframe)[a-z][\w-]*\b[^<>]*\stitle=/g)).toEqual([])
})
