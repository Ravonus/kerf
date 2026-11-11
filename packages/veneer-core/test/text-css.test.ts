// @vitest-environment node
// The field subset preserves shared rules; specialized controls retain the complete sheet.
import { readFileSync } from 'node:fs'
import { build } from '../scripts/split-css.mjs'
import { items } from '../scripts/split-css/parse.mjs'

const { files } = build()
const rules = (name: string): string[] =>
  items(files.get(`inputs/${name}.css`)!)
    .list.filter((item: { kind: string }) => item.kind === 'rule')
    .map((item: { text: string }) => item.text)

test('the field subset retains the two shared coarse-pointer rules verbatim and in order', () => {
  const complete = rules('text')
  const shared = rules('text-field')
  expect(shared).toHaveLength(2)
  expect(shared[0]).toContain('[data-pointer="coarse"]')
  expect(shared[1]).toContain('@media (pointer: coarse)')
  let at = -1
  for (const rule of shared) {
    expect(rule).toContain('[data-part="action"]')
    expect(rule).toContain('[data-part="clear"]')
    const next = complete.indexOf(rule)
    expect(next).toBeGreaterThan(at)
    at = next
  }
  for (const part of ['stepper', 'mask', 'scrub']) {
    expect(complete.some((rule) => rule.includes(`data-part="${part}"`))).toBe(true)
    expect(shared.some((rule) => rule.includes(`data-part="${part}"`))).toBe(false)
  }
})

test('specialized existing consumers still import the complete public sheet', () => {
  for (const name of ['NumberField.tsx', 'admin/atoms.tsx', 'flow/Otp.tsx']) {
    const source = readFileSync(new URL(`../../veneer/src/${name}`, import.meta.url), 'utf8')
    expect(source, name).toContain("import '@kerf-js/veneer-core/styles/inputs/text.css'")
  }
})
