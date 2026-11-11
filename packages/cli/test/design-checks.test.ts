import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { check } from '../src/check.mjs'
import { fix } from '../src/fix.mjs'
import { project } from './helpers.mjs'

const veneerPkg = {
  'package.json': JSON.stringify({
    name: 'a',
    dependencies: { '@kerf-js/core': '*', '@kerf-js/veneer': '*' },
  }),
}
const codes = (r: Awaited<ReturnType<typeof check>>) =>
  r.diagnostics
    .filter((d) => d.code.startsWith('D0'))
    .map((d) => d.code)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
const run = async (src: string, files: Record<string, string> = veneerPkg) => {
  const root = project({ ...files, 'src/Page.tsx': src })
  return { root, result: await check(root, { files: ['src/Page.tsx'] }) }
}
/** Apply a diagnostic's edits, last first, as an agent or an editor does. */
function apply(
  root: string,
  d: { fix: { edits: { file: string; offset: [number, number]; text: string }[] } },
) {
  const file = join(root, d.fix.edits[0]!.file)
  let text = readFileSync(file, 'utf8')
  for (const e of [...d.fix.edits].sort((a, b) => b.offset[0] - a.offset[0]))
    text = text.slice(0, e.offset[0]) + e.text + text.slice(e.offset[1])
  writeFileSync(file, text)
  return text
}

/** A veneer app of several files, checked whole. */
const app = async (pages: Record<string, string>) => {
  const root = project({ ...veneerPkg, ...pages })
  return { root, result: await check(root, { files: Object.keys(pages) }) }
}
const IMPORT = `import { Heading } from '@kerf-js/veneer'\n`

describe("what isn't off-system", () => {
  const sheet = (css: string, path = 'src/app.css') =>
    app({ [path]: css, 'src/Page.tsx': 'export const P = () => <p>x</p>' })
  test('a url, a zero radius, and sizes that follow the text or the container pass', async () => {
    const { result } = await sheet(
      `.a { background: url(/img/black.png); border-radius: 0; margin-block: 1lh; padding: clamp(1rem, 2vw, 2rem); gap: 2ch; border-radius: 50%; }`,
    )
    expect(codes(result)).toEqual([])
  })
  test('px off the scale and a real colour still fail', async () => {
    const { result } = await sheet(`.a { background: black; padding: 13px; }`)
    expect(codes(result)).toEqual(['D001', 'D002'])
    expect(result.diagnostics.find((d) => d.code === 'D001').why).toContain('veneer({ tokens })')
  })
  test('restyling a veneer part, and the theme file, warn rather than stop', async () => {
    const a = await sheet(`[data-scope="button"] { background: black; }`)
    expect(a.result.diagnostics.find((d) => d.code === 'D001').severity).toBe('warning')
    const b = await sheet(`.a { background: black; }`, 'src/theme.css')
    expect(b.result.diagnostics.find((d) => d.code === 'D001').severity).toBe('warning')
  })
})

describe('a CSP against inlined CSS', () => {
  const header = `export const h = { 'Content-Security-Policy': "default-src 'self'; style-src 'self'" }\n`
  test('D012 until inlining is off or inline styles are allowed', async () => {
    const page = 'export const P = () => <p>x</p>'
    expect(codes((await app({ 'src/Page.tsx': page, 'src/headers.tsx': header })).result)).toEqual([
      'D012',
    ])
    const allowed = header.replace(
      "default-src 'self'; style-src 'self'",
      "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    )
    expect(codes((await app({ 'src/Page.tsx': page, 'src/headers.tsx': allowed })).result)).toEqual(
      [],
    )
    expect(
      codes(
        (
          await app({
            'src/Page.tsx': page,
            'src/headers.tsx': header,
            'kerf.config.json': '{ "site": { "inlineCss": false } }',
          })
        ).result,
      ),
    ).toEqual([])
  })
})

describe('D012 reads the policy a browser would apply', () => {
  const page = 'export const P = () => <p>x</p>'
  const found = async (files: Record<string, string>) =>
    (await app({ 'src/Page.tsx': page, ...files })).result.diagnostics
      .filter((d) => d.code === 'D012')
      .map((d) => d.severity)
  const in_ = (policy: string) => ({
    'src/headers.tsx': `export const h = { 'Content-Security-Policy': "${policy}" }\n`,
  })

  registerPolicyCases(found, in_)

  test('a report-only policy blocks nothing', async () => {
    expect(
      await found({
        'src/headers.tsx': `export const h = { 'Content-Security-Policy-Report-Only': "style-src 'self'" }\n`,
      }),
    ).toEqual([])
  })

  test('a policy in a const above the header, or an array joined', async () => {
    expect(
      await found({
        'src/headers.tsx': `const csp = "default-src 'self'"\nexport const h = { 'Content-Security-Policy': csp }\n`,
      }),
    ).toEqual(['error'])
    expect(
      await found({
        'src/headers.tsx': `const csp = ["default-src 'self'", "style-src 'unsafe-inline'"].join('; ')\nexport const h = { 'Content-Security-Policy': csp }\n`,
      }),
    ).toEqual(['warning'])
  })

  test("a host's headers file", async () => {
    expect(
      await found({ 'public/_headers': `/*\n  Content-Security-Policy: style-src 'self'\n` }),
    ).toEqual(['error'])
  })
})

describe('role drift', () => {
  test('D006 one level at two roles across files; the common role wins and the fix matches it', async () => {
    const { root, result } = await app({
      'src/A.tsx': `${IMPORT}export const A = () => <Heading level={1}>A</Heading>`,
      'src/B.tsx': `${IMPORT}export const B = () => <Heading level={1} role="title">B</Heading>`,
      'src/C.tsx': `${IMPORT}export const C = () => <Heading level={1} role="display">C</Heading>`,
    })
    const ds = result.diagnostics.filter((d) => d.code === 'D006')
    expect(ds).toHaveLength(1)
    expect(ds[0].file).toBe('src/C.tsx')
    expect(ds[0].why).toContain('h1 renders at two roles')
    expect(apply(root, ds[0])).toContain('<Heading level={1}>C</Heading>')
    expect(codes(await check(root, { files: ['src/A.tsx', 'src/B.tsx', 'src/C.tsx'] }))).toEqual([])
  })
  test('D006 a role that outnumbers the default is what the rest move to', async () => {
    const { root, result } = await app({
      'src/A.tsx': `${IMPORT}export const A = () => <><Heading level={1} role="display">A</Heading><Heading level={1} role="display">B</Heading></>`,
      'src/B.tsx': `${IMPORT}export const B = () => <Heading level={1}>C</Heading>`,
    })
    const [d, ...rest] = result.diagnostics.filter((x) => x.code === 'D006')
    expect(rest).toEqual([])
    expect(apply(root, d)).toContain('<Heading role="display" level={1}>C</Heading>')
  })
  registerDefaultHeadingRole()
  test('D006 leaves one role per level, a hidden role, and an allowed exception alone', async () => {
    const { result } = await app({
      'src/A.tsx': `${IMPORT}export const A = ({ r, n }) => <><Heading level={1}>A</Heading><Heading level={1} role={r}>B</Heading><Heading level={n} role="label">C</Heading></>`,
      'src/B.tsx': `${IMPORT}export const B = () => (\n  // kerf-allow D006: the marketing hero\n  <Heading level={1} role="display">C</Heading>\n)`,
    })
    expect(result.diagnostics.filter((d) => d.code === 'D006')).toEqual([])
  })
  test('D006 a level of only bare headings is left alone, and it needs veneer', async () => {
    const bare = await app({ 'src/A.tsx': `export const A = () => <><h1>A</h1><h1>B</h1></>` })
    expect(codes(bare.result)).toEqual([])
    const root = project({
      'package.json': JSON.stringify({ name: 'a' }),
      'src/A.tsx': `export const A = ({ Heading }) => <><Heading level={1}>A</Heading><Heading level={1} role="display">B</Heading></>`,
    })
    expect(codes(await check(root, { files: ['src/A.tsx'] }))).toEqual([])
  })
  test('D040 the style gate on main content, and not on a side part', async () => {
    const { result } = await run(
      `export const P = () => <main data-kerf="styled"><aside data-kerf="styled">x</aside></main>`,
    )
    expect(result.diagnostics.filter((d) => d.code === 'D040').length).toBe(1)
  })

  test('D007 a bare link is swapped for Link, and the import follows', async () => {
    const { root, result } = await run(
      `import { Row } from '@kerf-js/veneer'\nexport const P = () => <Row as="nav"><a href="/a">Home</a></Row>`,
    )
    const d = result.diagnostics.find((x) => x.code === 'D007')
    expect(d.fix.safe).toBe(false)
    const fixed = apply(root, d)
    expect(fixed).toContain('<Link href="/a">Home</Link>')
    expect(fixed).toContain(`import { Row, Link } from '@kerf-js/veneer'`)
    expect(codes(await check(root, { files: ['src/Page.tsx'] }))).toEqual([])
  })
  test('D007 leaves a styled link, an anchor with no href, and a name that is taken', async () => {
    const { result } = await run(
      `import { Link } from 'router'\nexport const P = () => <><a href="/a" class="x">A</a><a id="top">B</a><Link href="/c">C</Link></>`,
    )
    expect(codes(result)).toEqual([])
    const taken = await run(
      `import { Link } from 'router'\nexport const P = () => <a href="/a">A</a>`,
    )
    expect(taken.result.diagnostics.find((d) => d.code === 'D007').fix.edits).toBeUndefined()
  })
  test('D007 needs veneer', async () => {
    const { result } = await run(`export const P = () => <a href="/a">A</a>`, {
      'package.json': JSON.stringify({ name: 'a' }),
    })
    expect(codes(result)).toEqual([])
  })
})

describe('values (an app with veneer)', () => {
  test('D001 a raw colour, with no autofix', async () => {
    const { result } = await run(`export const P = () => <p style={{ color: '#7c3aed' }}>x</p>`)
    const d = result.diagnostics.find((x) => x.code === 'D001')
    expect(d.why).toContain('#7c3aed')
    expect(d.fix.edits).toBeUndefined()
  })
  test('D002 a scale step by hand has a safe fix that keeps the type', async () => {
    const { root, result } = await run(
      `export const P = () => <p style={{ padding: '16px' }}>x</p>`,
    )
    const d = result.diagnostics.find((x) => x.code === 'D002')
    expect(d.fix.safe).toBe(true)
    expect(apply(root, d)).toContain(`padding: 'var(--veneer-space-group)'`)
    expect(codes(await check(root, { files: ['src/Page.tsx'] }))).toEqual([])
  })
  registerSpacingShorthand()
  test('D002 off the scale has no fix', async () => {
    const { result } = await run(`export const P = () => <p style="padding: 13px">x</p>`)
    expect(result.diagnostics.find((d) => d.code === 'D002').fix.edits).toBeUndefined()
  })
  registerTailwindSpacing()
  test('D001 and D003 on Tailwind classes', async () => {
    const { result } = await run(
      `export const P = () => <p class="bg-purple-500 text-lg rounded-[8px] bg-surface">x</p>`,
    )
    expect(codes(result)).toEqual(['D001', 'D003', 'D003'])
    expect(result.diagnostics.find((d) => d.why.includes('rounded')).fix.edits[0].text).toBe(
      'rounded-control',
    )
  })
  registerHandRolledStack()
  registerTailwindStack()
  test('D005 an input type or title the browser paints', async () => {
    const { result } = await run(
      `import { Input } from '@kerf-js/veneer'\nexport const A = () => <><Input label="N" type="number" /><input type="date" aria-label="D" /><span title="x">y</span><input data-part="sr-only" type="range" aria-label="R" /><iframe title="f" /></>`,
    )
    expect(result.diagnostics.filter((d) => d.code === 'D005')).toHaveLength(3)
  })

  registerNativeButton()
  test('!important is not part of a value: zero stays zero, and a raw value is still caught', async () => {
    const root = project({
      ...veneerPkg,
      'src/app.css': `.a { margin: 0 !important; }\n.b { gap: 7px !important; }\n`,
    })
    const r = await check(root)
    expect(r.diagnostics.filter((d) => d.file === 'src/app.css').map((d) => d.code)).toEqual([
      'D002',
    ])
  })

  test('static files in public/ are not the app', async () => {
    const root = project({ ...veneerPkg, 'public/built.css': `.a { color: #123456; }\n` })
    const r = await check(root)
    expect(r.diagnostics.filter((d) => d.file === 'public/built.css')).toEqual([])
  })

  test('in app CSS, but not a token definition', async () => {
    const root = project({
      ...veneerPkg,
      'src/app.css': `:root { --brand: #123456; }\n.a { color: #123456; padding: 16px; }\n`,
    })
    const r = await check(root)
    const css = r.diagnostics.filter((d) => d.file === 'src/app.css').map((d) => d.code)
    expect(css).toEqual(['D001', 'D002'])
  })
  test('a tokenless app is left alone: it chose its own CSS', async () => {
    const { result } = await run(
      `export const P = () => <p class="bg-purple-500 p-3" style={{ color: '#7c3aed', padding: '13px' }}>x</p>`,
      { 'package.json': '{"name":"a"}' },
    )
    expect(codes(result)).toEqual([])
  })
})

describe('contrast and accessibility (every app)', () => {
  const bare = { 'package.json': '{"name":"a"}' }
  test.each([
    ['D011', `<p style={{ color: '#999', background: '#fff' }}>x</p>`],
    ['D030', `<input placeholder="Name" />`],
    ['D030', `<select />`],
    ['D031', `<button><svg /></button>`],
    ['D031', `<a href="/x"></a>`],
    ['D032', `<img src="a.png" />`],
    ['D033', `<div onClick={() => {}}>x</div>`],
    ['D034', `<a href="/x"><button>y</button></a>`],
    ['D036', `<input aria-label="x" style={{ outline: 'none' }} />`],
    ['D036', `<input aria-label="x" class="outline-none" />`],
    ['D037', `<p tabindex="3">x</p>`],
    ['D035', `<><h1>a</h1><h3>b</h3></>`],
    ['D041', `<span data-part="req" title="Required" aria-label="required"></span>`],
    ['D041', `<div aria-labelledby="t">x</div>`],
    ['D041', `<p role="presentation" aria-label="x">y</p>`],
  ])('%s %s', async (code, jsx) => {
    const { result } = await run(`export const P = () => ${jsx}`, bare)
    expect(codes(result)).toContain(code)
  })
  registerAccessibleMarkupCases(bare)
  test('D033 turns a div into a button; D037 has a safe fix', async () => {
    const { root, result } = await run(
      `export const P = () => <div onClick={() => {}}>x</div>\n`,
      bare,
    )
    expect(
      apply(
        root,
        result.diagnostics.find((d) => d.code === 'D033'),
      ),
    ).toContain(`<button type="button" onClick={() => {}}>x</button>`)
    const two = await run(`export const P = () => <p tabindex="3">x</p>\n`, bare)
    const d = two.result.diagnostics.find((x) => x.code === 'D037')
    expect(d.fix.safe).toBe(true)
    expect(apply(two.root, d)).toContain(`tabindex="0"`)
  })
  test('veneer: Heading level drives D035, two solids are D038, a name goes in `label`', async () => {
    const { result } = await run(
      `import { Button, Heading } from '@kerf-js/veneer'\nexport const P = () => <form><Heading level={1}>a</Heading><Heading level={4}>b</Heading><Button>Save</Button><Button>Send</Button><Button emphasis="ghost">No</Button><Button label="Close"><svg /></Button></form>\n`,
    )
    expect(codes(result).filter((c) => c !== 'D038')).toEqual(['D035'])
    expect(result.diagnostics.filter((d) => d.code === 'D038')).toHaveLength(2)
  })
  test('D039 in index.html', async () => {
    const root = project({ 'index.html': '<!doctype html><html><head></head></html>\n' })
    expect((await check(root)).diagnostics.map((d) => d.code)).toContain('D039')
  })
})

describe('which apps get the token codes', () => {
  test('headless @kerf-js/veneer-core has no tokens, so a fix would point at variables that do not exist', async () => {
    const { result } = await run(`export const P = () => <p style={{ padding: '16px' }}>x</p>`, {
      'package.json': JSON.stringify({
        name: 'a',
        dependencies: { '@kerf-js/core': '*', '@kerf-js/veneer-core': '*' },
      }),
    })
    expect(codes(result)).toEqual([])
  })
})

describe('turning it off', () => {
  test('`// kerf-allow` with a reason keeps one site', async () => {
    const { result } = await run(
      `export const P = () => (\n  // kerf-allow D001: the brand gradient from marketing\n  <p style={{ color: '#7c3aed' }}>x</p>\n)`,
    )
    expect(codes(result)).toEqual([])
  })
  test('a reason is required', async () => {
    const { result } = await run(
      `export const P = () => (\n  // kerf-allow D001\n  <p style={{ color: '#7c3aed' }}>x</p>\n)`,
    )
    expect(codes(result)).toEqual(['D001'])
  })
  test('check.design: false', async () => {
    const { result } = await run(
      `export const P = () => <p style={{ color: '#7c3aed' }}><img /></p>`,
      { ...veneerPkg, 'kerf.config.json': '{ "check": { "design": false } }' },
    )
    expect(codes(result)).toEqual([])
  })
})

describe('kerf fix', () => {
  test('applies the safe fixes and leaves the suggestions', async () => {
    const root = project({
      ...veneerPkg,
      'src/Page.tsx': `export const P = () => <section style={{ padding: '16px', gap: 8 }} tabindex="2"><div onClick={() => {}}>x</div></section>\n`,
    })
    const { applied } = await fix(root, { files: ['src/Page.tsx'] })
    expect(applied.map((a) => a.code).sort((a, b) => a.localeCompare(b))).toEqual([
      'D002',
      'D002',
      'D037',
    ])
    const text = readFileSync(join(root, 'src/Page.tsx'), 'utf8')
    expect(text).toContain(
      `padding: 'var(--veneer-space-group)', gap: 'var(--veneer-space-related)'`,
    )
    expect(text).toContain('tabindex="0"')
    expect(text).toContain('<div onClick') // D033 changes the element: the agent's call
  })
  test('compiler autofixes go through it too', async () => {
    const root = project({
      'src/Page.tsx': `import { state } from '@kerf-js/core'\nexport function P() { const n = state(0); return <p>{n}</p> }\n`,
    })
    expect((await fix(root, { files: ['src/Page.tsx'] })).applied.map((a) => a.code)).toEqual([
      'W015',
    ])
    expect(readFileSync(join(root, 'src/Page.tsx'), 'utf8')).toContain('{n.value}')
  })
})

test('a share card is an image: its raw colours and sizes are fine', async () => {
  const root = project({
    ...veneerPkg,
    'src/routes/_default.og.tsx':
      'export default function Card() { return <div style="color:#123456;padding:13px"><img src="/a.png" /></div> }',
  })
  expect(
    (await check(root)).diagnostics.filter(
      (d) => d.code.startsWith('D0') && d.file.endsWith('.og.tsx'),
    ),
  ).toEqual([])
})

function registerPolicyCases(
  found: (files: Record<string, string>) => Promise<string[]>,
  in_: (policy: string) => Record<string, string>,
) {
  test.each([
    ['style-src alone', "style-src 'self'", ['error']],
    ['default-src as the fallback', "default-src 'self'", ['error']],
    [
      'unsafe-inline only for attributes',
      "style-src 'self'; style-src-attr 'unsafe-inline'",
      ['error'],
    ],
    [
      'a nonce beside unsafe-inline',
      "style-src 'unsafe-inline' 'nonce-abc'; script-src-attr 'unsafe-inline'",
      ['error'],
    ],
    [
      'a hash beside unsafe-inline',
      "style-src 'unsafe-inline' 'sha256-abc'; script-src-attr 'unsafe-inline'",
      ['error'],
    ],
    [
      'elements allowed by their own directive',
      "style-src 'self'; style-src-elem 'unsafe-inline'; script-src-attr 'unsafe-inline'",
      [],
    ],
    ['handlers only: the page has none', "style-src 'unsafe-inline'; script-src-attr 'none'", []],
    [
      'script-src as the fallback for inline scripts',
      "style-src 'unsafe-inline'; script-src 'self'",
      ['warning'],
    ],
    [
      'script-src-elem before script-src',
      "style-src 'unsafe-inline'; script-src 'unsafe-inline'; script-src-elem 'self'",
      ['warning'],
    ],
    [
      'default-src as the fallback for inline scripts',
      "default-src 'self'; style-src 'unsafe-inline'",
      ['warning'],
    ],
    [
      'a host the entry may come from',
      "style-src 'unsafe-inline'; script-src https://cdn.example.com",
      ['warning'],
    ],
    [
      'no script at all, so nothing switches the sheets on',
      "style-src 'unsafe-inline'; script-src 'none'",
      ['error'],
    ],
    [
      "a nonce kerf doesn't put on its scripts",
      "style-src 'unsafe-inline'; script-src 'nonce-abc' 'strict-dynamic'",
      ['error'],
    ],
    [
      "strict-dynamic ignores the 'self' beside it",
      "style-src 'unsafe-inline'; script-src 'nonce-a' 'strict-dynamic' 'self'",
      ['error'],
    ],
    [
      'inline scripts alone still switch the sheets on',
      "style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      [],
    ],
    ['a default that allows inline scripts', "default-src 'unsafe-inline'", []],
    ['everything allowed', "style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'", []],
    ['a policy on neither', "img-src 'self'", []],
  ])('%s', async (_, policy, want) => {
    expect(await found(in_(policy))).toEqual(want)
  })
}

function registerDefaultHeadingRole() {
  test('D006 h2 is the default level, a bare heading beside Heading is swapped, and the import follows', async () => {
    const { root, result } = await app({
      'src/A.tsx': `${IMPORT}export const A = () => <><Heading>A</Heading><Heading role="title">B</Heading></>`,
      'src/B.tsx': `export const B = () => <h3>C</h3>`,
      'src/C.tsx': `${IMPORT}export const C = () => <Heading level={3}>D</Heading>`,
    })
    const ds = result.diagnostics.filter((d) => d.code === 'D006')
    expect(ds.map((d) => d.file).sort((a, b) => a.localeCompare(b))).toEqual([
      'src/A.tsx',
      'src/B.tsx',
    ])
    const fixed = apply(
      root,
      ds.find((d) => d.file === 'src/B.tsx'),
    )
    expect(fixed).toContain('<Heading level={3}>C</Heading>')
    expect(fixed).toContain(`import { Heading } from '@kerf-js/veneer'`)
  })
}

function registerHandRolledStack() {
  test('D004 a hand-rolled stack becomes <Stack> with its import', async () => {
    const { root, result } = await run(
      `export function P() {\n  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><p>x</p></div>\n}\n`,
    )
    const d = result.diagnostics.find((x) => x.code === 'D004')
    const text = apply(root, d)
    expect(text).toContain(`<Stack gap="group"><p>x</p></Stack>`)
    expect(text.startsWith(`import { Stack } from '@kerf-js/veneer'\n`)).toBe(true)
    expect(
      (await check(root, { files: ['src/Page.tsx'] })).diagnostics.filter((x) => x.code === 'D004'),
    ).toEqual([])
  })
}

function registerTailwindStack() {
  test('D004 Tailwind classes, into an existing import', async () => {
    const { root, result } = await run(
      `import { Card } from '@kerf-js/veneer'\nexport const P = () => <section class="flex gap-2"><Card /></section>\n`,
    )
    const text = apply(
      root,
      result.diagnostics.find((d) => d.code === 'D004'),
    )
    expect(text).toContain(`import { Card, Row } from '@kerf-js/veneer'`)
    expect(text).toContain(`<Row as="section" gap="related"><Card /></Row>`)
  })
}

function registerNativeButton() {
  test('D005 a native button becomes Button', async () => {
    const { root, result } = await run(
      `export const P = () => <button onClick={() => {}}>Save</button>\n`,
    )
    expect(
      apply(
        root,
        result.diagnostics.find((d) => d.code === 'D005'),
      ),
    ).toContain(`<Button onClick={() => {}}>Save</Button>`)
  })
}

function registerSpacingShorthand() {
  test('D002 a number and a shorthand', async () => {
    const { root, result } = await run(
      `export const P = () => <p style={{ gap: 8, margin: '4px 16px' }}>x</p>`,
    )
    const [a, b] = result.diagnostics.filter((d) => d.code === 'D002')
    apply(root, b)
    expect(apply(root, a)).toContain(
      `gap: 'var(--veneer-space-related)', margin: 'var(--veneer-space-tight) var(--veneer-space-group)'`,
    )
  })
}

function registerTailwindSpacing() {
  test('D002 Tailwind steps map to the adapter', async () => {
    const { root, result } = await run(
      `export const P = () => <p class="p-4 md:gap-2 mt-[13px] p-related">x</p>`,
    )
    const ds = result.diagnostics.filter((d) => d.code === 'D002')
    expect(ds).toHaveLength(3)
    apply(root, ds[1])
    expect(apply(root, ds[0])).toContain('class="p-group md:gap-related mt-[13px] p-related"')
    expect(ds[2].fix.edits).toBeUndefined()
  })
}

function registerAccessibleMarkupCases(bare: Record<string, string>) {
  test.each([
    `<label>Name <input /></label>`,
    `<><label for="a">Name</label><input id="a" /></>`,
    `<input aria-label="Name" />`,
    `<input type="hidden" />`,
    `<input {...attrs} />`,
    `<><label for={\`\${id}-a\`}>Name</label><input id={\`\${id}-a\`} /></>`,
    `<input aria-hidden="true" tabindex={-1} name="website" />`,
    `<Field label="Name" for="a"><input id="a" /></Field>`,
    `<Field label="Name"><input /></Field>`,
    `<button aria-label="Close"><svg /></button>`,
    `<button>Save</button>`,
    `<button>{label}</button>`,
    `<a href="/x"><img src="a.png" alt="Home" /></a>`,
    `<a name="top"></a>`,
    `<img src="a.png" alt="" />`,
    `<div role="button" tabindex="0" onClick={() => {}}>x</div>`,
    `<p style={{ color: '#111', background: '#fff' }}>x</p>`,
    `<input aria-label="x" class="outline-none focus-visible:ring-2" />`,
    `<><h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2></>`,
    `<label>Pick <button>one</button></label>`,
    `<span role="img" aria-label="required"></span>`,
    `<div role="region" aria-label="Prices" tabindex="0">x</div>`,
    `<nav aria-label="Main">x</nav>`,
  ])('quiet: %s', async (jsx) => {
    const { result } = await run(
      `const attrs = {}, label = 'x'\nexport const P = () => ${jsx}`,
      bare,
    )
    expect(codes(result)).toEqual([])
  })
}
