// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import veneerIcons, { icons, type IconsOptions } from '@kerf-js/veneer-icons/plugin'

const env = { command: 'build', mode: 'production', root: '.' } as const

test('no tier: nothing is aliased, so the page keeps its CSS switch', () => {
  expect(icons().contribute(env).tokens!.alias).toBeUndefined()
})

test.each(['quiet', 'balanced', 'vivid'])(
  'tier %s resolves @kerf-js/veneer-icons to that tier',
  (tier) => {
    expect(
      icons({ tier: tier as NonNullable<IconsOptions['tier']> }).contribute(env).tokens!.alias,
    ).toEqual({
      '@kerf-js/veneer-icons': `@kerf-js/veneer-icons/${tier}`,
    })
  },
)

test('a bad option is refused by name', () => {
  // @ts-expect-error -- not a tier: the types refuse it before the plugin does
  expect(() => icons({ tier: 'loud' })).toThrow(/must be one of/)
  // @ts-expect-error -- not an option
  expect(() => icons({ size: 16 })).toThrow(/unknown option/)
})

test('its AGENTS section fits the 1 KB limit', () => {
  expect(Buffer.byteLength(icons().contribute(env).agents!.text)).toBeLessThanOrEqual(1024)
})

test('the plugin entry ships its types, so `import veneerIcons from` in an app is typed (no TS7016)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    files: string[]
    exports: Record<string, string | { types?: string; default: string }>
  }
  const entry = pkg.exports['./plugin'] as { types: string; default: string }
  expect(entry).toEqual({ types: './plugin.d.mts', default: './plugin.mjs' })
  expect(existsSync(new URL(`../${entry.types}`, import.meta.url))).toBe(true)
  expect(pkg.files).toContain('plugin.d.mts')
  // The default export is the same plugin, and what it returns is what `plugins: []` takes.
  expect(veneerIcons).toBe(icons)
  const options: IconsOptions = { tier: 'balanced', source: 'https://cdn.example/icons/' }
  expect(veneerIcons(options).name).toBe('@kerf-js/veneer-icons')
})
