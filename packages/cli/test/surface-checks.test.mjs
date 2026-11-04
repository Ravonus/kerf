// Surfaces in `weft check` and `weft surfaces` (research 33 §8, §9), on a copy of the v3 reference app with planted files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { listSurfaces } from '../src/surface-checks.mjs'
import { project } from './helpers.mjs'

const codes = (r, ...only) => r.diagnostics.filter((d) => only.includes(d.code)).map((d) => d.code)
const at = (r, code) => r.diagnostics.find((d) => d.code === code)

describe('surface checks', () => {
  it('X009: a <Surface> needs label or decorative', async () => {
    const r = await check(
      project({
        'src/S.tsx': `import { defineSurface, Surface as View } from '@weft-js/core/surface'
const S = defineSurface({ name: 's', kind: 'webgl2', setup() {} })
export const A = () => <View use={S} />
export const B = () => <View use={S} label="Stars" />
export const C = () => <View use={S} decorative />
`,
      }),
    )
    expect(codes(r, 'X009')).toEqual(['X009'])
    expect(at(r, 'X009').span[0]).toBe(3)
  })

  it('X010: fillText outside s.text and s.decorative, wherever it sits in the file', async () => {
    const dir = project({
      'src/S.ts': `import { defineSurface } from '@weft-js/core/surface'
const hud = (ctx: any) => ctx.fillText('helper', 0, 0)
export const S = defineSurface({ name: 's', kind: 'canvas2d', setup(s) {
  s.draw(() => {
    s.ctx.strokeText('raw', 0, 0)
    s.decorative(() => s.ctx.fillText('ok', 0, 0))
    hud(s.ctx)
  })
} })
`,
      'src/Other.ts': `export const f = (c: any) => c.fillText('not a surface', 0, 0)\n`,
    })
    const r = await check(dir)
    expect(r.diagnostics.filter((d) => d.code === 'X010').map((d) => [d.file, d.span[0]])).toEqual([
      ['src/S.ts', 2],
      ['src/S.ts', 5],
    ])
  })

  it('X002: a system or generic-only family in s.text', async () => {
    const r = await check(
      project({
        'src/S.ts': `import { defineSurface } from '@weft-js/core/surface'
export const S = defineSurface({ name: 's', kind: 'webgl2', setup(s) {
  s.text('a', { x: 0, y: 0, width: 9, font: '16px system-ui' })
  s.text('b', { x: 0, y: 0, width: 9, font: '16px monospace' })
  s.text('c', { x: 0, y: 0, width: 9, font: '600 16px Inter, sans-serif' })
} })
`,
      }),
    )
    expect(r.diagnostics.filter((d) => d.code === 'X002').map((d) => d.span[0])).toEqual([3, 4])
  })

  it('X011 and X012: hiding the mirror, or defeating its fallback', async () => {
    const r = await check(
      project({
        'src/S.tsx': `import { defineSurface, Surface } from '@weft-js/core/surface'
const S = defineSurface({ name: 's', kind: 'webgl2', setup(s) { s.el.setAttribute('aria-hidden', 'true') } })
export const A = () => <Surface use={S} label="a" aria-hidden="true" />
export const B = () => <Surface use={S} label="b" style="forced-color-adjust:none" />
`,
        'src/s.css': `[data-surface-text] { display: none; }
[data-surface] { forced-color-adjust: none; }
@media print { [data-surface-text] { visibility: hidden; } }
[data-surface] { border: 1px solid; }
`,
      }),
    )
    expect(
      r.diagnostics
        .filter((d) => ['X011', 'X012'].includes(d.code))
        .map((d) => [d.code, d.file, d.span[0]]),
    ).toEqual([
      ['X011', 'src/s.css', 1],
      ['X012', 'src/s.css', 2],
      ['X012', 'src/s.css', 3],
      ['X011', 'src/S.tsx', 2],
      ['X011', 'src/S.tsx', 3],
      ['X012', 'src/S.tsx', 4],
    ])
  })

  it('X040 and X041: per-character spans', async () => {
    const long = 'x'.repeat(201)
    const r = await check(
      project({
        'src/G.tsx': `const LONG = '${long}'
const SHORT = 'hello'
export const A = () => <p>{LONG.split('').map(c => <span aria-hidden="true">{c}</span>)}</p>
export const B = () => <h1 aria-label={SHORT}>{[...SHORT].map(c => <span>{c}</span>)}</h1>
export const C = () => <h1>{Array.from(SHORT).map(c => <span aria-hidden="true">{c}</span>)}</h1>
export const D = () => <h1 aria-label={SHORT}>{[...SHORT].map(c => <span aria-hidden="true">{c}</span>)}</h1>
export const E = (props: { rows: string[] }) => <ul>{props.rows.map(r => <span>{r}</span>)}</ul>
export const F = () => <p>{Array.from({ length: 3 }, (_, i) => <span>{i}</span>)}</p>
`,
      }),
    )
    expect(
      r.diagnostics
        .filter((d) => ['X040', 'X041'].includes(d.code))
        .map((d) => [d.code, d.span[0]]),
    ).toEqual([
      ['X040', 3],
      ['X041', 3],
      ['X041', 4],
      ['X041', 5],
    ])
    expect(at(r, 'X040').why).toContain('201 graphemes')
  })

  it('P101: canvas s.text with no text.measure, and a kind with no provider, at the line that needs them', async () => {
    const r = await check(
      project({
        'src/S.ts': `import { defineSurface } from '@weft-js/core/surface'
export const A = defineSurface({ name: 'a', kind: 'canvas2d', setup(s) { s.text('x', { x: 0, y: 0, width: 9 }) } })
export const B = defineSurface({ name: 'b', kind: 'webgl2', setup(s) { s.text('x', { x: 0, y: 0, width: 9 }) } })
export const C = defineSurface({ name: 'c', kind: 'keel-pixel', setup() {} })
`,
      }),
    )
    expect(r.diagnostics.filter((d) => d.code === 'P101').map((d) => d.span[0])).toEqual([2, 4])
  })

  it('a clean surface file reports nothing', async () => {
    const r = await check(
      project({
        'src/S.tsx': `import { defineSurface, Surface } from '@weft-js/core/surface'
const S = defineSurface({ name: 's', kind: 'webgl2', setup(s) { s.frame(() => s.gl.clear(16384)) } })
export const A = () => <Surface use={S} label="Stars" />
`,
      }),
    )
    expect(r.diagnostics.filter((d) => /^X|^P101/.test(d.code))).toEqual([])
  })
})

it('weft surfaces lists name, kind, props and file from the source alone', () => {
  const dir = project({
    'src/stars.ts': `import { defineSurface } from '@weft-js/core/surface'
import { z } from 'zod'
export const Stars = defineSurface({ name: 'stars', kind: 'webgl2', props: z.object({ density: z.number(), hue: z.number() }), setup() {} })
`,
    'src/bars.tsx': `import { defineSurface } from '@weft-js/core/surface'
export const Bars = defineSurface<{ data: number[] }>({ name: 'bars', kind: 'canvas2d', pixel: { width: 64, height: 64 }, setup() {} })
`,
  })
  expect(listSurfaces(dir)).toEqual([
    { name: 'bars', kind: 'canvas2d', props: ['data'], file: 'src/bars.tsx', line: 2, pixel: true },
    { name: 'stars', kind: 'webgl2', props: ['density', 'hue'], file: 'src/stars.ts', line: 3 },
  ])
  expect(readFileSync(join(dir, 'src/bars.tsx'), 'utf8')).toContain('defineSurface')
})
