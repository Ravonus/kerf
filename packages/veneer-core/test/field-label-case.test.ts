// @vitest-environment node
// Verifies floating field labels default to uppercase both at rest and floated (no case snap on slide-up),
// while exposing --veneer-label-case / --veneer-label-float-case and data-label-case / data-label-float-case overrides.
import { readFileSync } from 'node:fs'

const read = (name: string) => readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8')

test('floating field labels default to uppercase at rest and floated with customizable case tokens', () => {
  const base = read('veneer.css')
  expect(base).toContain('--veneer-label-case: uppercase')
  expect(base).toContain('--veneer-label-float-case: var(--veneer-label-case)')
  expect(base).toContain('text-transform: var(--veneer-label-case)')
  expect(base).toContain('text-transform: var(--veneer-label-float-case)')
  for (const mode of ['upper', 'lower', 'title', 'sentence', 'none']) {
    expect(base, `data-label-case="${mode}"`).toContain(`[data-label-case="${mode}"]`)
    expect(base, `data-label-float-case="${mode}"`).toContain(`[data-label-float-case="${mode}"]`)
  }
  // Accessible hidden label text stays un-transformed so screen readers never spell out uppercase names.
  expect(base).toMatch(/\[data-part="label-text"\][^{]*\{[^}]*text-transform:\s*none/)
})

test('inputs/field lift rule uses --veneer-label-float-case', () => {
  const field = read('inputs/field.css')
  expect(field).toContain('text-transform: var(--veneer-label-float-case)')
})
