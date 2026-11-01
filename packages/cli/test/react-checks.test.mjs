// `weft check` W043, a literal boolean on a `data-*` attribute whose `weft fix` renders the same, and W044, a random key.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { entry } from '../src/catalog.mjs'
import { fix } from '../src/fix.mjs'
import { project } from './helpers.mjs'

const file = 'src/routes/flags.tsx'
const app = body => project({ [file]: `export default function Flags(props: { on: boolean }) {\n  return ${body}\n}\n` })
const w043 = r => r.diagnostics.filter(d => d.code === 'W043')

describe('W043', () => {
  it('is in the catalog, as a warning', () => {
    expect(entry('W043')).toMatchObject({ severity: 'warning', by: 'cli' })
  })

  it('flags `data-x={true}` and says what it writes', async () => {
    const r = await check(app('<div data-open={true} />'))
    const [d] = w043(r)
    expect(d).toMatchObject({ severity: 'warning', file, span: [2, 15, 2, 31] })
    expect(d.why).toContain('`data-open=""`')
    expect(d.fix).toMatchObject({ safe: true })
    expect(r.ok).toBe(true)
  })

  it('flags `data-x={false}`', async () => {
    const [d] = w043(await check(app('<div data-open={false} />')))
    expect(d.why).toContain('no attribute')
  })

  it.each([
    ['a dynamic value', '<div data-open={props.on} />'],
    ['a string', '<div data-open="true" />'],
    ['the bare form', '<div data-open />'],
    ['a stringified value', '<div data-open={String(props.on)} />'],
    ['a component prop, which arrives untouched', '<Panel data-open={true} />'],
    ['a word attribute', '<div aria-hidden={true} />'],
  ])('leaves %s alone', async (_, body) => {
    expect(w043(await check(app(body)))).toEqual([])
  })

  it('`weft fix` applies it, and the check comes back clean', async () => {
    const dir = app('<div data-open={true} data-closed={false} id="a" />')
    await fix(dir)
    expect(readFileSync(join(dir, file), 'utf8')).toContain('<div data-open id="a" />')
    expect(w043(await check(dir))).toEqual([])
  })
})

describe('W044', () => {
  const w044 = r => r.diagnostics.filter(d => d.code === 'W044')
  it('is in the catalog, as a warning', () => {
    expect(entry('W044')).toMatchObject({ severity: 'warning', by: 'cli' })
  })
  it.each(['crypto.randomUUID()', 'Date.now()', 'Math.random()', '`row-${Date.now()}`'])('flags key={%s}', async key => {
    const [d] = w044(await check(app(`<ul>{[1].map(n => <li key={${key}}>{n}</li>)}</ul>`)))
    expect(d).toMatchObject({ severity: 'warning', file })
    expect(d.why).toContain('differs between the server and the client')
  })
  it('leaves a stable key alone', async () => {
    expect(w044(await check(app('<ul>{[1].map(n => <li key={n}>{n}</li>)}</ul>')))).toEqual([])
  })
})
