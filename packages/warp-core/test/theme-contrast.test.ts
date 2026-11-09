// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('scripts/contrast-check.mjs')
const css = resolve('styles/warp.css')
const pair = (part: string, site: string, foreground = '#ffffff') => ({
  palette: 'ocean',
  theme: 'dark',
  expression: 'vivid',
  part,
  state: 'hover',
  emphasis: 'solid',
  site,
  path: 'themes.ocean.parts.button.hover.text',
  fg: { token: '--warp-button-text', value: foreground },
  bg: { token: '--warp-button-bg', value: '#000000' },
})
function run(pairs?: object[], checker = script) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-theme-contrast-'))
  try {
    const file = join(dir, 'pairs.json')
    if (pairs) writeFileSync(file, JSON.stringify(pairs))
    return spawnSync(
      process.execPath,
      [checker, css, '--json', ...(pairs ? [`--theme-pairs=${file}`] : [])],
      { encoding: 'utf8' },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const sites = [
  ['button', 'base'],
  ['button', 'fill-start'],
  ['button', 'fill-end'],
  ['button', 'fill-fallback'],
  ['button', 'fill-relative'],
  ['button', 'border'],
  ['sweep', 'text-filled'],
  ['sweep', 'text-unfilled'],
  ['sweep', 'stroke-base'],
  ['sweep', 'stroke-surface'],
  ['sweep', 'base-surface'],
] as const

test('keeps all canonical checks and thresholds', () => {
  const result = run()
  expect(result.status).toBe(0)
  const data = JSON.parse(result.stdout)
  expect(data.results).toHaveLength(858)
  expect(data.results.every((row: { pass: boolean }) => row.pass)).toBe(true)
})

test('checks every supplied Button and sweep paint with its fixed threshold', () => {
  const good = run(sites.map(([part, site]) => pair(part, site)))
  expect(good.status).toBe(0)
  const rows = JSON.parse(good.stdout).results.filter(
    (row: { group: string }) => row.group === 'Theme part',
  )
  expect(rows).toHaveLength(sites.length)
  expect(rows.map((row: { min: number }) => row.min)).toEqual([
    4.5, 4.5, 4.5, 4.5, 4.5, 3, 4.5, 4.5, 3, 3, 3,
  ])
  expect(rows.every((row: { pass: boolean }) => row.pass)).toBe(true)
  for (const [part, site] of sites) {
    const bad = run([pair(part, site, '#111111')])
    expect(bad.status, `${part}/${site}`).toBe(1)
    const failure = JSON.parse(bad.stdout).results.find(
      (row: { group: string }) => row.group === 'Theme part',
    )
    expect(failure).toMatchObject({
      pass: false,
      code: 'D010',
      palette: 'ocean',
      theme: 'dark',
      expression: 'vivid',
      part,
      site,
      state: 'hover',
      path: 'themes.ocean.parts.button.hover.text',
      fg: '--warp-button-text',
      bg: '--warp-button-bg',
    })
  }
})

test('fails closed on unsupported paint or unresolved colour', () => {
  for (const value of [pair('button', 'unknown'), pair('button', 'base', 'var(--unknown)')]) {
    const result = run([value])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('D010 themes.ocean.parts.button.hover.text')
  }
})

test('rejects a malformed pair option instead of ignoring it', () => {
  const result = spawnSync(process.execPath, [script, css, '--theme-pairs'], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('D010 use exactly one --theme-pairs=<file>')
})

test('keeps light and dark expression results distinct', () => {
  const pairs = ['light', 'dark'].flatMap((theme) =>
    ['quiet', 'balanced', 'vivid'].map((expression) => ({
      ...pair('button', 'base'),
      theme,
      expression,
    })),
  )
  const result = run(pairs)
  expect(result.status).toBe(0)
  const rows = JSON.parse(result.stdout).results.filter(
    (row: { group: string }) => row.group === 'Theme part',
  )
  expect(rows.map((row: { combo: string }) => row.combo)).toEqual([
    'light/quiet',
    'light/balanced',
    'light/vivid',
    'dark/quiet',
    'dark/balanced',
    'dark/vivid',
  ])
})

test('both checkers reject transparent mixes and malformed colour components', () => {
  const checkers = [script, resolve('../../docs/design/warp/scripts/contrast-check.mjs')]
  const invalid = [
    'color-mix(in oklab, oklch(1 0 0 / 0) 50%, oklch(1 0 0 / 0))',
    'color-mix(in oklab, oklch(1 0 0) 25%, oklch(1 0 0) 25%)',
    'oklch(1 0 0 99)',
    'oklch(1 0 0 /)',
    'oklch(1 0 0 / 1 / 1)',
    'color-mix(in oklab, oklch(1 0 0),, oklch(1 0 0))',
    'color-mix(in oklab, oklch(1 0 0), oklch(1 0 0), oklch(1 0 0))',
  ]
  for (const checker of checkers) {
    for (const value of invalid) {
      const candidate = { ...pair('button', 'base', '#000000'), bg: { token: '--bg', value } }
      const result = run([candidate], checker)
      expect(result.status, `${checker}: ${value}`).toBe(1)
      expect(result.stderr).toContain('D010 themes.ocean.parts.button.hover.text')
    }
    const opaque = {
      ...pair('button', 'base', '#000000'),
      bg: {
        token: '--bg',
        value: 'color-mix(in oklab, oklch(1 0 0) 50%, oklch(1 0 0))',
      },
    }
    expect(run([opaque], checker).status).toBe(0)
  }
})
