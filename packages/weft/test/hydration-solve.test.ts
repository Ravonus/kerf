// Partial hydration's inference (PLAN §11), through the real compiler: what `solve` says about small projects, and what
// the compiler emits for its answer. A file it can't see through has to come out as client code; nothing else is safe.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { solve } from '../node/hydration.mjs'

const { transform } = createRequire(import.meta.url)('../compiler.cjs')

const dirs: string[] = []
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

async function project(files: Record<string, string>, entries = ['route.tsx']) {
  const root = mkdtempSync(join(tmpdir(), 'weft-solve-'))
  dirs.push(root)
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true })
    writeFileSync(join(root, f), text)
  }
  const plan = await solve({
    entries: entries.map(e => join(root, e)),
    transform,
    rel: f => relative(root, f),
    resolve: async (spec, from) => {
      if (!spec.startsWith('.')) return undefined
      const base = resolve(dirname(from), spec)
      return Object.keys(files).map(f => join(root, f)).find(f => f === base || f.startsWith(`${base}.`) || f === join(base, 'index.tsx'))
    },
  })
  const why = (name: string) => plan.report.flatMap(f => f.nodes).find(n => n.name === name)?.client
  return { root, plan, why, routeStatic: plan.statics.has(join(root, entries[0])) }
}

const button = `export function Button(props) { return <button onClick={() => {}}>{props.label}</button> }`

test('text and markup need nothing', async () => {
  const { plan, routeStatic } = await project({ 'route.tsx': `export default function R() { return <main><h1>Hi</h1></main> }` })
  expect(routeStatic).toBe(true)
  expect(plan.islands).toEqual([])
})

test('a handler makes its component client, and a call of it an island', async () => {
  const { plan, why, routeStatic } = await project({
    'button.tsx': button,
    'route.tsx': `import { Button } from './button'\nexport default function R() { return <main><Button label="go" /></main> }`,
  })
  expect(why('Button')).toMatch(/onClick/)
  expect(routeStatic).toBe(true)
  expect(plan.islands.map(i => i.id)).toEqual(['route.tsx#0'])
})

test('it follows re-exports and barrels', async () => {
  const { plan } = await project({
    'ui/button.tsx': button,
    'ui/index.ts': `export * from './button'`,
    'kit.ts': `export { Button as Press } from './ui'`,
    'route.tsx': `import { Press } from './kit'\nexport default function R() { return <Press label="go" /> }`,
  })
  expect(plan.islands.length).toBe(1)
})

test('reactivity reaches callers through what they read', async () => {
  const { why } = await project({
    'route.tsx': `import { state } from 'weft'\nconst n = state(0)\nfunction Show() { return <p>{n.value}</p> }\nexport default function R() { return <Show /> }`,
  })
  expect(why('Show')).toBeTruthy()
})

test('a function prop over local names keeps the caller on the client', async () => {
  const { why, routeStatic } = await project({
    'button.tsx': button,
    'route.tsx': `import { Button } from './button'\nexport default function R(props) { return <Button label="x" run={() => props.go()} /> }`,
  })
  expect(why('R')).toMatch(/function over local names/)
  expect(routeStatic).toBe(false)
})

test('a spread on an island keeps the caller on the client', async () => {
  const { why } = await project({
    'button.tsx': button,
    'route.tsx': `import { Button } from './button'\nexport default function R(props) { return <Button {...props} /> }`,
  })
  expect(why('R')).toMatch(/spread/)
})

test('a component from a package it can\'t read counts as client', async () => {
  const { plan } = await project({
    'route.tsx': `import { Chart } from 'some-chart'\nexport default function R() { return <Chart /> }`,
  })
  expect(plan.islands.length).toBe(1)
})

test('a module with top-level side effects ships', async () => {
  const { why } = await project({
    'route.tsx': `import './setup'\nwindow.tracked = true\nexport default function R() { return <p>x</p> }`,
    'setup.ts': ``,
  })
  expect(why('R')).toMatch(/as it loads/)
})

test('the hatches: `@weft client` keeps code on the client, `@weft static` stops the inference', async () => {
  const forced = await project({ 'route.tsx': `/* @weft client */\nexport default function R() { return <p>x</p> }` })
  expect(forced.routeStatic).toBe(false)
  const held = await project({
    'route.tsx': `import { state } from 'weft'\nconst n = state(0)\n/* @weft static */\nexport default function R() { return <p>{n.value}</p> }`,
  })
  expect(held.routeStatic).toBe(true)
})

describe('what the compiler emits for an island', () => {
  const source = `import { Button, Box } from './ui'
export default function R(props) {
  return <main><Button label="go" start={props.n} /><Box><p>{props.note}</p></Box></main>
}`
  const islands = { id: 'route.tsx', sites: [{ index: 0, hoist: false }, { index: 1, hoist: false }] }

  test('the server wraps the call, with the props that travel', () => {
    const { code } = transform(source, { filename: 'route.tsx', generate: 'ssr', hydratable: true, islands })
    expect(code).toMatch(/island\("route\.tsx#0", \["start"\], Button/)
    expect(code).toMatch(/slot\(\(\) =>/) // Box's children stay the server's
  })

  test('the client gets a `$iN` per site, the literal props in it', () => {
    const { code } = transform(source, { filename: 'route.tsx', hydratable: true, islands })
    expect(code).toMatch(/export const \$i0\b/)
    expect(code).toMatch(/export const \$i1\b/)
    expect(code).toContain('"go"')
  })

  test('without a plan nothing changes', () => {
    const { code } = transform(source, { filename: 'route.tsx', hydratable: true })
    expect(code).not.toContain('$i0')
  })
})
