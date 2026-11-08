import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tailwindTheme } from '../src/plugin/tailwind.mjs'

const config = {
  colors: { brand: '#123456' },
  system: {
    space: { '2': '4px' },
    radius: { card: '4px' },
    font: { body: 'sans' },
    shadow: { sm: 'none' },
    text: { body: { size: '1rem' } },
  },
  themes: { ocean: { colors: { sea: '#123456' } } },
}

describe('Tailwind theme entries', () => {
  it('keeps the template identical to the packaged default', () => {
    expect(readFileSync(new URL('../tailwind.template.css', import.meta.url), 'utf8')).toBe(
      readFileSync(new URL('../tailwind.css', import.meta.url), 'utf8'),
    )
  })
  it('emits deterministic unique entries with canonical aliases', () => {
    const css = tailwindTheme(config)
    expect(css).toContain('--color-brand: var(--warp-named-brand);')
    expect(css).toContain('--color-sea: var(--warp-named-sea);')
    expect(css).toContain('--spacing-2: var(--warp-space-2);')
    expect(css).toContain('--radius-card: var(--warp-radius-surface);')
    expect(css).toContain('--font-body: var(--warp-font-sans);')
    expect(css).toContain('--shadow-sm: var(--warp-elevation-1);')
    expect(css).toContain('--text-body--line-height: var(--warp-text-body-leading);')
    expect(css.match(/--radius-card:/g)).toHaveLength(1)
    expect(tailwindTheme({ ...config, colors: { zed: 'x', brand: 'y' } })).toBe(
      tailwindTheme({ ...config, colors: { brand: 'y', zed: 'x' } }),
    )
  })
})
