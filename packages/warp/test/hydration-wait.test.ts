// @vitest-environment node
// warp's components let the islands that hold them wait (hydration.json `loads`, H010). A page whose islands hold only
// Card, Badge or Button loads none of them with the page: `./styles` is CSS alone, and Button passing its node on to
// the `ref` it was given is not work of its own (the caller's `ref` is checked where the caller wrote it).
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solve } from '@weft-js/core/hydration'

const warp = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(warp, 'package.json'))
const { transform } = require('@weft-js/core/compiler')
const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

const isFile = (f: string) => existsSync(f) && statSync(f).isFile()
function find(spec: string, from: string) {
  if (spec.startsWith('.')) return EXT.map((e) => resolve(dirname(from), spec) + e).find(isFile)
  try {
    return require.resolve(spec)
  } catch {
    return undefined
  }
}

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

async function plan(route: string) {
  const root = mkdtempSync(join(tmpdir(), 'warp-wait-'))
  dirs.push(root)
  writeFileSync(join(root, 'route.tsx'), route)
  return solve({
    entries: [join(root, 'route.tsx')],
    transform,
    rel: (f: string) => relative(root, f),
    resolve: (spec: string, from: string) => Promise.resolve(find(spec, from)),
  })
}

const holds = (load: { when: string }) => load.when === 'visible' || load.when === 'interaction'

test('islands that hold only Card, Badge or Button wait for the screen or a hand', async () => {
  const { loads, diagnostics } = await plan(`import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'
function Count() {
  const n = state(0)
  return <Card title="Count"><Badge tone="accent">{n.value}</Badge><Button onClick={() => n.value++}>Add</Button></Card>
}
export default function R() {
  return <main>
    <Count />
    <Button onClick={() => {}}>Go</Button>
    <Card onClick={() => {}}>Press</Card>
  </main>
}
`)
  const page = loads.filter((l: { id: string }) => l.id.startsWith('route.tsx#'))
  expect(page.map((l: { tag: string }) => l.tag)).toEqual(['Count', 'Button', 'Card'])
  for (const load of page) expect(load, `${load.tag}: ${load.why}`).toSatisfy(holds)
  expect(
    diagnostics.filter(
      (d: { code: string; file: string }) => d.code === 'H010' && d.file === 'route.tsx',
    ),
  ).toEqual([])
})

test("a ref the caller gives Button is the caller's: one that does work still loads with the page", async () => {
  const { loads } = await plan(`import { Button } from '@weft-js/warp'
export default function R() {
  return <main><Button ref={(n) => n.focus()} onClick={() => {}}>Go</Button></main>
}
`)
  expect(loads.find((l: { tag: string }) => l.tag === 'Button')).toMatchObject({
    when: 'load',
    why: expect.stringMatching(/`ref` callback that does work/),
  })
})

test("no warp component's own `ref` counts as work: each one only keeps the node, or passes it on", async () => {
  const { loads } =
    await plan(`import { DateField, Menu, NumberField, TimeField } from '@weft-js/warp'
export default function R() {
  return <main>
    <NumberField label="Seats" onValueChange={() => {}} />
    <Menu label="More" items={[{ label: 'Copy', onSelect: () => {} }]} />
    <DateField label="Day" onValueChange={() => {}} />
    <TimeField label="At" onValueChange={() => {}} />
  </main>
}
`)
  const refs = loads.filter((l: { why: string }) => /`ref` callback that does work/.test(l.why))
  expect(refs.map((l: { tag: string; why: string }) => `${l.tag}: ${l.why}`)).toEqual([])
})
