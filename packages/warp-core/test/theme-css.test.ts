import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { lowerTheme } from '../scripts/theme-css.mjs'

it('lowers the opt-in button sheet byte for byte', () => {
  const names = [
    '--warp-button-bg',
    '--warp-config-part-button-bg',
    '--warp-button-text',
    '--warp-config-part-button-text',
  ]
  const themed = readFileSync('styles/themed/components/button.css', 'utf8')
  const legacy = readFileSync('styles/components/button.css', 'utf8')
  expect(lowerTheme(themed, names)).toBe(legacy)
  expect(themed).not.toBe(legacy)
})

it('keeps existing variables and rejects missing fallbacks', () => {
  expect(lowerTheme('var(--old,var(--new,calc(1px + var(--raw))))', ['--new'])).toBe(
    'var(--old,calc(1px + var(--raw)))',
  )
  expect(() => lowerTheme('var(--new)', ['--new'])).toThrow('Missing fallback')
  expect(() => lowerTheme('var(--new,)', ['--new'])).toThrow('Missing fallback')
})
