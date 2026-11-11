// Phase 2's X-codes in `kerf check` (research 26 §7), on a copy of the v3 reference app with planted files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { fluidFor } from '../src/text-checks.mjs'
import { project } from './helpers.mjs'

const x = (r: Awaited<ReturnType<typeof check>>) =>
  r.diagnostics.filter((d) => d.code.startsWith('X'))
const apply = (
  dir: string,
  d: { file: string; fix: { edits: { offset: [number, number]; text: string }[] } },
) => {
  const text = readFileSync(join(dir, d.file), 'utf8')
  const e = d.fix.edits[0]!
  return text.slice(0, e.offset[0]) + e.text + text.slice(e.offset[1])
}

describe('X-codes', () => {
  registerFluidTypeDiagnostics()

  it('X020, X021, X022: a hand-written face with no fallback, block display and no subset', async () => {
    const face =
      "@font-face { font-family: 'Brand'; src: url(./brand.woff2) format('woff2'); font-display: block; }\n"
    const r = await check(project({ 'src/fonts.css': face }))
    expect(x(r).map((d) => d.code)).toEqual(['X020', 'X022', 'X021'])
    const x021 = x(r).find((d) => d.code === 'X021')
    expect(x021.fix).toMatchObject({ safe: true, edits: [{ text: 'swap' }] })
    expect(x(r).find((d) => d.code === 'X020').why).toContain(
      'add `@kerf/text` and declare it in `text({ fonts })`',
    )

    const fine =
      "@font-face { font-family: 'Brand'; src: url(./brand-latin.woff2); font-display: swap; unicode-range: U+0000-00FF; }\n" +
      "@font-face { font-family: 'Brand Fallback'; src: local('Arial'); size-adjust: 104%; }\n"
    expect(x(await check(project({ 'src/fonts.css': fine })))).toEqual([])
  })

  registerViewportDiagnostics()

  it('X023: a font preload no face uses', async () => {
    const r = await check(
      project({
        'src/fonts.css':
          "@font-face { font-family: 'Brand'; src: url(./brand-latin.woff2); unicode-range: U+0000-00FF; }\n@font-face { font-family: 'Brand Fallback'; src: local('Arial'); }\n",
        'index.html':
          '<link rel="preload" as="font" type="font/woff2" href="/fonts/old.woff2" crossorigin><link rel="preload" as="font" href="/brand-latin.woff2" crossorigin>',
      }),
    )
    expect(x(r).map((d) => [d.code, d.why.match(/`([^`]+)`/)[1]])).toEqual([
      ['X023', '/fonts/old.woff2'],
    ])
  })

  registerMediaAndBoundaryDiagnostics()

  it('X033: a pending skeleton with no value check', async () => {
    const dir = project({
      'src/Feed.tsx': `import { Skeleton } from '@kerf/veneer'
export function A(props) { return props.q.pending ? <Skeleton /> : <p>{props.q.value}</p> }
export function B(props) { return props.q.value === undefined && props.q.pending ? <Skeleton /> : <p /> }
export function C(props) { return props.q.pending ? <p>Saving</p> : <p /> }
`,
    })
    const r = await check(dir)
    expect(x(r).map((d) => [d.code, d.span[0]])).toEqual([['X033', 2]])
    expect(x(r)[0].why).toContain('props.q'.split('.').pop())
  })

  it('X035: streamed text in a scroll container', async () => {
    const dir = project({
      'src/Chat.tsx': `import { reply } from './x'
export function A() {
  const out = reply.stream()
  return <div style="overflow-y: auto"><p>{out.value}</p></div>
}
export function B() {
  const out = reply.stream()
  return <div style="overflow-y: hidden"><p>{out.value}</p></div>
}
export function C() {
  const n = count()
  return <div style="overflow: auto"><p>{n.value}</p></div>
}
`,
    })
    expect(x(await check(dir)).map((d) => [d.code, d.span[0]])).toEqual([['X035', 4]])
  })

  it('the v3 reference stays clean', async () => {
    expect(x(await check(project()))).toEqual([])
  })
})

function registerViewportDiagnostics() {
  it('X008: zoom-blocking viewport meta in HTML and JSX, with a safe fix', async () => {
    const dir = project({
      'index.html':
        '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
      'src/Head.tsx':
        'export function Head() { return <meta name="viewport" content="width=device-width, maximum-scale=1.5" /> }\n',
    })
    const r = await check(dir)
    const [html, tsx] = x(r).sort((a, b) => a.file.localeCompare(b.file))
    expect([html.code, tsx.code]).toEqual(['X008', 'X008'])
    expect(apply(dir, html)).toBe(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">',
    )
    expect(apply(dir, tsx)).toContain('content="width=device-width"')
    expect(
      x(
        await check(
          project({
            'index.html': '<meta name="viewport" content="width=device-width, maximum-scale=5">',
          }),
        ),
      ),
    ).toEqual([])
  })
}

function registerMediaAndBoundaryDiagnostics() {
  it('X030 and X034: undimensioned media and timers inside a Boundary', async () => {
    const dir = project({
      'src/Feed.tsx': `import { Boundary } from '@kerf/core'
function Spinner() { setTimeout(() => {}, 300); return <p>…</p> }
export function Feed() {
  return (
    <Boundary pending={<Spinner />}>
      <img src="/a.png" alt="A" />
      <img src="/b.png" alt="B" width={64} height={64} />
      <video src="/c.mp4" style="aspect-ratio: 16/9" />
    </Boundary>
  )
}
export function Outside() { return <img src="/d.png" alt="D" /> }
`,
    })
    const r = await check(dir)
    expect(x(r).map((d) => [d.code, d.span[0]])).toEqual([
      ['X034', 5],
      ['X030', 6],
    ])
    expect(x(r)[0].why).toContain('(<Spinner>)')
  })
}

function registerFluidTypeDiagnostics() {
  it("X005 and X006: viewport-only sizes and clamps that zoom can't double", async () => {
    const dir = project({
      'src/type.css':
        'h1 { font-size: 4vw; }\nh2 { font-size: clamp(1rem, 1rem + 5vw, 3rem); }\nh3 { font-size: clamp(1.5rem, 1.3rem + 0.7cqi, 1.9rem); }\n.t { font-size: var(--veneer-text-title-size); }\n',
      'src/Hero.tsx':
        "export function Hero() { return <h1 style={{ fontSize: '3cqi' }}>Hi</h1> }\n",
    })
    const r = await check(dir)
    expect(x(r).map((d) => [d.code, d.file, d.span[0]])).toEqual([
      ['X005', 'src/Hero.tsx', 1],
      ['X005', 'src/type.css', 1],
      ['X006', 'src/type.css', 2],
    ])
    const [tsx, css, clamp] = x(r)
    expect(readFileSync(join(dir, 'src/type.css'), 'utf8').slice(...css.offset)).toBe('4vw')
    expect(css.fix).toMatchObject({ safe: false, edits: [{ text: fluidFor(4) }] })
    expect(apply(dir, css)).toContain(
      'h1 { font-size: clamp(0.938rem, calc(0.355rem + 2.486cqi), 2.344rem); }',
    ) // 15px → 37.5px, ratio 2.5
    expect(readFileSync(join(dir, 'src/Hero.tsx'), 'utf8').slice(...tsx.offset)).toBe('3cqi')
    expect(clamp.why).toContain('3.00×')
  })
}
