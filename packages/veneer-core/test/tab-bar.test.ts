import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('tab bar css', () => {
  const css = readFileSync(new URL('../styles/layout/tab-bar.css', `file://${__filename}`), 'utf8')
  it('ships its page padding with it, and hides off phones', () => {
    expect(css).toContain('padding-block-end: var(--veneer-tab-bar-space)')
    expect(css).toMatch(/:where\(\[data-scope="tab-bar"\]\) \{ display: none; \}/)
    expect(css).toContain('[data-tucked]')
  })
})
