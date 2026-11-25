// @vitest-environment node
// Verifies the Segmented active-adjacent liquid border merge defaults/tokens and the floating field label z-index +
// clipped accordion clearance shipped by split-css.
import { readFileSync } from 'node:fs'

const read = (name: string) => readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8')

test('segmented ships active-adjacent liquid merge defaults with customizable curve and fillet tokens', () => {
  for (const sheet of ['inputs/choice-segmented.css', 'inputs/choice.css']) {
    const css = read(sheet)
    expect(css, sheet).toContain('--veneer-segmented-merge-radius: 0px')
    expect(css, sheet).toContain('--veneer-segmented-merge-fillet: 9px')
    expect(css, sheet).toContain('border-start-end-radius: var(--veneer-segmented-merge-radius)')
    expect(css, sheet).toContain('border-start-start-radius: var(--veneer-segmented-merge-radius)')
    expect(css, sheet).toContain(':dir(rtl)')
    // Zero nested :has() — browsers silently drop nested :has() selectors.
    expect(css, sheet).not.toMatch(/:has\([^)]*:has\(/)
  }
  const base = read('veneer.css')
  expect(base).toContain('border-radius var(--veneer-sweep-duration) var(--veneer-ease-out)')
})

test('floating field label sits above sibling controls and accordion panels clear floated labels', () => {
  const base = read('veneer.css')
  expect(base).toMatch(
    /:where\(\[data-scope="field"\] \[data-part="label"\][^{]*\{[^}]*z-index:\s*20\b/,
  )
  const accordion = read('components/accordion.css')
  expect(accordion).toContain(
    'padding-block-start: max(0px, calc(-1 * var(--veneer-label-float-offset)))',
  )
})
