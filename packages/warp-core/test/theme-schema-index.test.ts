import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const root = resolve(process.cwd(), '../..')

test('indexes tracked source token reads with spans and reconciles each AST census', () => {
  const schema = JSON.parse(
    readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8'),
  ) as {
    sources: string[]
    registry: {
      sourceIndex: {
        source: string
        astCount: number
        indexedCount: number
        astOnly: string[]
        sourceOnly: string[]
      }[]
      sites: {
        id: string
        source: string
        fallback: string
        fallbackSpan: number[]
        classification: string
        role?: { part: string; path: string }
      }[]
    }
  }
  expect(schema.registry.sites.filter((site) => site.classification === 'binding')).toHaveLength(38)
  expect(
    schema.registry.sites.some((site) => site.role?.part === 'link' && site.role.path === 'text'),
  ).toBe(true)
  expect(schema.registry.sourceIndex.map((row) => row.source).toSorted()).toEqual(
    schema.sources.toSorted(),
  )
  expect(schema.registry.sites).toHaveLength(6803)
  expect(new Set(schema.registry.sites.map((site) => site.id)).size).toBe(6803)
  for (const row of schema.registry.sourceIndex) {
    expect(row.indexedCount).toBe(row.astCount)
    expect(row.astOnly).toEqual([])
    expect(row.sourceOnly).toEqual([])
  }
  const sources = new Map(
    schema.sources.map((source) => [source, readFileSync(resolve(root, source), 'utf8')]),
  )
  for (const site of schema.registry.sites) {
    const [start, end] = site.fallbackSpan
    expect(sources.get(site.source)?.slice(start, end)).toBe(site.fallback)
    expect(['unresolved', 'binding', 'partial binding']).toContain(site.classification)
  }
})

test('keeps semantic site identity across preceding comments and detects changed reads', async () => {
  const { sourceIndex } = await import('../scripts/theme-schema-index.mjs')
  const css =
    '@layer warp.test { @media (hover: hover) { :where([data-scope="x"]) { color: var(--warp-a); } } }'
  const first = sourceIndex('fixture.css', css)[0]
  const commented = sourceIndex('fixture.css', `/* preceding */\n${css}`)[0]
  const changed = sourceIndex('fixture.css', css.replace('--warp-a', '--warp-b'))[0]
  expect(commented.id).toBe(first.id)
  expect(changed.id).toBe(first.id)
  expect(changed.reads).not.toEqual(first.reads)
  expect(first.atRules).toEqual(['@layer warp.test', '@media (hover: hover)'])
  expect(first.selectors).toEqual([':where([data-scope="x"])'])
})

test('normalizes finite groups from simple-scope consumers without closing them', async () => {
  const { partTypes } = await import('../scripts/theme-schema-types.mjs')
  expect(() => partTypes([{ part: 'x', state: 'rest', path: 'width', domain: 'unknown' }])).toThrow(
    'Unknown theme domain: unknown',
  )
  const schema = JSON.parse(
    readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8'),
  ) as {
    registry: {
      groups: {
        id: string
        token: string
        domain: string
        units: string
        binding: string
        siteIds: string[]
      }[]
      sites: { id: string; fallback: string; selectors: string[]; classification: string }[]
    }
  }
  const radius = schema.registry.groups.find((row) => row.id === 'button.rest.radius')
  expect(radius).toMatchObject({
    token: '--warp-button-radius',
    domain: 'radius',
    units: 'px',
    binding: 'partial',
  })
  expect(radius?.siteIds.length).toBeGreaterThan(0)
  const site = schema.registry.sites.find((row) => row.id === radius?.siteIds[0])
  expect(site).toMatchObject({
    fallback: 'var(--warp-radius-control)',
    classification: 'partial binding',
  })
  expect(schema.registry.groups.find((row) => row.id === 'button.rest.border')?.units).toBe(
    'px width only',
  )
  expect(new Set(schema.registry.groups.map((row) => row.token)).size).toBe(
    schema.registry.groups.length,
  )
})

test('records finite system names, aliases, units and unresolved families', () => {
  const schema = JSON.parse(
    readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8'),
  ) as {
    registry: {
      systemScales: {
        path: string
        status: string
        allowCustom?: boolean
        entries: { key: string; token?: string; aliasOf?: string; unit?: string; status: string }[]
      }[]
    }
  }
  const radius = schema.registry.systemScales.find((row) => row.path === 'radius')
  expect(radius?.allowCustom).toBe(true)
  expect(radius?.entries.find((row) => row.key === 'card')).toMatchObject({
    token: '--warp-radius-surface',
    aliasOf: 'surface',
    unit: 'px',
    status: 'declared-input',
  })
  const focus = schema.registry.systemScales.find((row) => row.path === 'focus')
  expect(focus?.entries.find((row) => row.key === 'color')).toMatchObject({
    token: '--warp-color-focus',
    unit: 'forbidden',
  })
  expect(schema.registry.systemScales.find((row) => row.path === 'breakpoint')?.status).toBe(
    'unresolved',
  )
})
