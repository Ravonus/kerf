import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { lowerTheme, themeNames } from '../scripts/theme-css.mjs'

it('lowers each opt-in sheet byte for byte', () => {
  for (const path of [
    'warp.css',
    'components/button.css',
    'components/nav.css',
    'components/tabs.css',
    'components/link.css',
    'components/pill.css',
  ]) {
    const themed = readFileSync(`styles/themed/${path}`, 'utf8')
    const legacy = readFileSync(`styles/${path}`, 'utf8')
    expect(lowerTheme(themed, themeNames)).toBe(legacy)
    expect(themed).not.toBe(legacy)
  }
})

it('keeps existing variables and rejects missing fallbacks', () => {
  expect(lowerTheme('var(--old,var(--new,calc(1px + var(--raw))))', ['--new'])).toBe(
    'var(--old,calc(1px + var(--raw)))',
  )
  expect(() => lowerTheme('var(--new)', ['--new'])).toThrow('Missing fallback')
  expect(() => lowerTheme('var(--new,)', ['--new'])).toThrow('Missing fallback')
})

it('keeps the added field, frame and link reads in the themed sheets', () => {
  const foundation = readFileSync('styles/themed/warp.css', 'utf8')
  const link = readFileSync('styles/themed/components/link.css', 'utf8')
  const nav = readFileSync('styles/themed/components/nav.css', 'utf8')
  for (const name of [
    'field-label',
    'field-label-floated',
    'field-label-interaction',
    'field-label-invalid',
    'sweep-stroke',
    'sweep-base',
  ]) {
    expect(foundation).toContain(`var(--warp-${name},`)
  }
  expect(link).toContain('var(--warp-link-underline,')
  expect(nav).toContain('var(--warp-nav-text-interaction,')
  expect(() => lowerTheme('var(--warp-field-label)', themeNames)).toThrow('Missing fallback')
})

it('routes the resting Button background through the animated paint sites', () => {
  const themed = readFileSync('styles/themed/components/button.css', 'utf8')
  const before = themed.split(':where([data-scope="button"])::before {')[1]?.split('\n}')[0]
  expect(before).toBeDefined()
  expect(before?.match(/var\(--warp-button-bg,/g)).toHaveLength(8)
  expect(before).toContain(
    'var(--warp-config-part-button-bg,var(--warp-tone-layer, var(--_layer)))',
  )
})

it('rejects an unclosed optional themed block', () => {
  expect(() => lowerTheme('/* warp-theme-only:start */ x', themeNames)).toThrow(
    'Unclosed theme-only block',
  )
})
