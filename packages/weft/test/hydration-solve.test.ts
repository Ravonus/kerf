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
    resolve: (spec, from) => {
      if (!spec.startsWith('.')) return Promise.resolve(undefined)
      const base = resolve(dirname(from), spec)
      return Promise.resolve(Object.keys(files).map(f => join(root, f)).find(f => f === base || f.startsWith(`${base}.`) || f === join(base, 'index.tsx')))
    },
  })
  const why = (name: string) => plan.report.flatMap(f => f.nodes).find(n => n.name === name)?.client
  return { root, plan, why, routeStatic: plan.statics.has(join(root, entries[0]!)) }
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
    'route.tsx': `import { state } from '@weft-js/core'\nconst n = state(0)\nfunction Show() { return <p>{n.value}</p> }\nexport default function R() { return <Show /> }`,
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
    'route.tsx': `import { state } from '@weft-js/core'\nconst n = state(0)\n/* @weft static */\nexport default function R() { return <p>{n.value}</p> }`,
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

// ---- when an island loads ------------------------------------------------------------------------------------------

const at = async (body: string, extra: Record<string, string> = {}) => {
  const { plan } = await project({ 'c.tsx': body, 'route.tsx': `import { C } from './c'\nexport default function R() { return <main><C /></main> }`, ...extra })
  return { load: plan.loads[0], diagnostics: plan.diagnostics }
}

test('handlers alone wait for an event', async () => {
  const { load, diagnostics } = await at(`import { state } from '@weft-js/core'\nexport function C() { const n = state(0); return <button onClick={() => { document.title = 'x'; n.value++ }}>{n.value}</button> }`)
  expect(load).toMatchObject({ when: 'interaction', tag: 'C' })
  expect(diagnostics).toEqual([])
})

test('work that stays inside waits for the viewport, and work that reaches out doesn\'t wait, with a fix', async () => {
  const inside = await at(`import { onMount, state } from '@weft-js/core'\nexport function C() { const n = state(0); onMount(() => { window.setTimeout(() => { n.value = 1 }, 10) }); return <p>{n.value}</p> }`)
  expect(inside.load!.when).toBe('visible')
  const out = await at(`import { onMount } from '@weft-js/core'\nexport function C() { onMount(() => { document.title = 'x' }); return <p onClick={() => {}}>c</p> }`)
  expect(out.load).toMatchObject({ when: 'load', why: expect.stringMatching(/document/) })
  expect(out.diagnostics).toMatchObject([{ code: 'H010', file: 'route.tsx', fix: expect.stringMatching(/@weft visible/) }])
})

test('moving focus can\'t wait, and neither can autofocus or a ref that works', async () => {
  expect((await at(`import { onMount } from '@weft-js/core'\nexport function C() { let e; onMount(() => e.focus()); return <input ref={e} /> }`)).load!.when).toBe('load')
  const auto = await at(`export function C() { return <input autofocus onInput={() => {}} /> }`)
  expect(auto.load!.when).toBe('load')
  expect(auto.diagnostics).toEqual([]) // nothing to fix: it's what was asked for
  expect((await at(`export function C() { return <div ref={el => el.scrollTo(0, 0)} /> }`)).load!.when).toBe('load')
})

test('what a child does counts, through the props the island keeps', async () => {
  const load = (await at(`import { D } from './d'\nexport function C() { return <div onClick={() => {}}><D /></div> }`, { 'd.tsx': `import { onMount } from '@weft-js/core'\nexport function D() { onMount(() => { navigator.vibrate(1) }); return <p /> }` })).load
  expect(load!.when).toBe('load')
  const { plan } = await project({
    'c.tsx': `export function C(props) { return <div onClick={() => {}}>{props.make()}</div> }`,
    'd.tsx': `import { onMount } from '@weft-js/core'\nexport function D() { onMount(() => {}); return <p /> }`,
    'route.tsx': `import { C } from './c'\nimport { D } from './d'\nconst make = () => <D />\nexport default function R() { return <C make={make} /> }`,
  })
  expect(plan.loads[0]!.when).toBe('visible')
})

test('a box at module level or a module that runs can\'t wait: nothing else would reach the island', async () => {
  const box = await at(`import { state } from '@weft-js/core'\nconst n = state(0)\nexport function C() { return <p onClick={() => { n.value++ }}>{n.value}</p> }`)
  expect(box.load).toMatchObject({ when: 'load', why: expect.stringMatching(/module level/) })
  expect(box.diagnostics[0]!.code).toBe('H010')
  expect((await at(`import './setup'\nexport function C() { return <p onClick={() => {}} /> }`, { 'setup.ts': `globalThis.x = 1` })).load!.when).toBe('load')
})

test('server data wants to be running once seen, a mutation passed along doesn\'t', async () => {
  const server = { 'x.server.ts': `export const list = () => 1; export const add = () => 1` }
  expect((await at(`import { list } from './x.server'\nexport function C() { const l = list(); return <p onClick={() => {}}>{l.value}</p> }`, server)).load!.when).toBe('visible')
  expect((await at(`import { add } from './x.server'\nimport { F } from './f'\nexport function C() { return <F of={add} /> }`, { ...server, 'f.tsx': `export function F(props) { return <form onSubmit={() => props.of()} /> }` })).load!.when).toBe('interaction')
  expect((await at(`import { Boundary } from '@weft-js/core'\nexport function C() { return <Boundary><p onClick={() => {}} /></Boundary> }`)).load!.when).toBe('visible')
})

test('the hatches: `@weft client` keeps its meaning, `@weft visible` overrules the proof', async () => {
  expect((await at(`/* @weft client */\nexport function C() { return <p onClick={() => {}} /> }`)).load).toMatchObject({ when: 'load', why: expect.stringMatching(/@weft client/) })
  const seen = await at(`import { onMount } from '@weft-js/core'\n/* @weft visible */\nexport function C() { onMount(() => { document.title = 'x' }); return <p /> }`)
  expect(seen.load!.when).toBe('visible')
  expect(seen.diagnostics).toEqual([])
})

test('`@weft interaction` stops the search at what it marks, and nothing else', async () => {
  const child = (hatch: string) => ({ 'd.tsx': `import { onMount } from '@weft-js/core'\n${hatch}\nexport function D() { onMount(() => { document.title = 'x' }); return <p /> }` })
  const route = `import { D } from './d'\nexport function C() { return <div onClick={() => {}}><D /></div> }`
  expect((await at(route, child(''))).load.when).toBe('load')
  expect((await at(route, child('/* @weft interaction */'))).load).toMatchObject({ when: 'interaction', why: expect.stringMatching(/handlers only/) })
  const beside = { ...child('/* @weft interaction */'), 'e.tsx': `import { onMount } from '@weft-js/core'\nexport function E() { onMount(() => {}); return <p /> }` }
  expect((await at(`import { D } from './d'\nimport { E } from './e'\nexport function C() { return <div onClick={() => {}}><D /><E /></div> }`, beside)).load.when).toBe('visible')
})

test('`lazy: false`: every island loads with the page, as an opt-out', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-solve-'))
  dirs.push(root)
  writeFileSync(join(root, 'c.tsx'), button.replace('Button', 'C'))
  writeFileSync(join(root, 'route.tsx'), `import { C } from './c'\nexport default function R() { return <main><C /></main> }`)
  const plan = await solve({ entries: [join(root, 'route.tsx')], transform, lazy: false, rel: f => relative(root, f), resolve: (spec, from) => Promise.resolve(spec.startsWith('.') ? `${resolve(dirname(from), spec)}.tsx` : undefined) })
  expect(plan.loads[0]!.when).toBe('load')
  expect([...plan.files.values()][0].sites[0].when).toBe('')
})

test('an import that only brings CSS keeps an island waiting; one that runs code does not', async () => {
  const route = `import { Tap } from './tap'\nexport default function R() { return <Tap /> }\n`
  const tap = `export function Tap() { return <button onClick={() => {}}>x</button> }\n`
  const when = (plan: Awaited<ReturnType<typeof solve>>) => plan.loads.find(l => l.tag === 'Tap')?.when
  const css = await project({ 'route.tsx': route, 'tap.tsx': `import './styles'\n${tap}`, 'styles.ts': `import './a.css'\n`, 'a.css': '' })
  const code = await project({ 'route.tsx': route, 'tap.tsx': `import './styles'\n${tap}`, 'styles.ts': `globalThis.x = 1\n` })
  expect(when(css.plan)).toBe('interaction')
  expect(when(code.plan)).toBe('load')
})

const layout = `import { untrack } from '@weft-js/core'
function Div({ children, ...rest }) { return <div {...rest}>{children}</div> }
const TAGS = { div: Div }
function Element({ as, ...rest }) { const Tag = TAGS[untrack(() => as) ?? 'div']; return <Tag {...rest} /> }
export function Stack({ gap, ...rest }) { return <Element data-gap={gap} {...rest} /> }
export function Card({ href, onClick, children, ...rest }) {
  if (untrack(() => href)) return <a href={href} onClick={onClick} {...rest}>{children}</a>
  return <div onClick={onClick} {...rest}>{children}</div>
}`

test('primitives that only read `untrack`, spread their props and pass a handler on stay static', async () => {
  const { plan, routeStatic, why } = await project({
    'layout.tsx': layout,
    'route.tsx': `import { Stack, Card } from './layout'\nexport default function R() { return <Stack gap="group"><Card>hi</Card></Stack> }`,
  })
  expect(why('Stack')).toBeNull()
  expect(why('Card')).toBeNull()
  expect(routeStatic).toBe(true)
  expect(plan.islands).toEqual([])
})

test('a call site that gives a passed-on handler is the island, and only that one', async () => {
  const { plan } = await project({
    'layout.tsx': layout,
    'route.tsx': `import { Stack, Card } from './layout'\nconst go = () => {}\nexport default function R() { return <Stack><Card>plain</Card><Card onClick={go}>press</Card></Stack> }`,
  })
  expect(plan.islands.map(i => i.id)).toEqual(['route.tsx#2'])
})

test('a handler under another name, or a spread of anything but the props, could hold a handler', async () => {
  const renamed = await project({
    'route.tsx': `function Press({ go }) { return <button onClick={go}>x</button> }\nexport default function R() { return <Press /> }`,
  })
  expect(renamed.why('Press')).toMatch(/onClick/)
  const spread = await project({
    'layout.tsx': layout,
    'route.tsx': `import { Stack } from './layout'\nexport default function R() { const a = pick(); return <Stack {...a}>hi</Stack> }`,
  })
  expect(spread.why('R')).toMatch(/spread/)
})

test('an island waits by what its hoisted children read, not only its own tag', async () => {
  const { plan } = await project({
    'route.tsx': `import { Boundary, state } from '@weft-js/core'
function Box({ children }) { const s = state(0); return <div onClick={() => s.value++}>{children}</div> }
function Inner() { const n = state(1); return <Boundary fallback="…">{n.value}</Boundary> }
export default function R() { return <main><Box><Inner /></Box></main> }`,
  })
  expect(plan.loads).toMatchObject([{ tag: 'Box', when: 'visible' }])
})

test('@weft visible on a hoisted child is reached', async () => {
  const { plan } = await project({
    'route.tsx': `import { onMount, state } from '@weft-js/core'
function Box({ children }) { const s = state(0); return <div onClick={() => s.value++}>{children}</div> }
/* @weft visible */
function Inner() { onMount(() => document.title); return <span>t</span> }
export default function R() { return <main><Box><Inner /></Box></main> }`,
  })
  expect(plan.loads).toMatchObject([{ tag: 'Box', when: 'visible', why: expect.stringMatching(/@weft visible/) }])
})

test('H017: a closure on a handler is why a route hydrates whole', async () => {
  const { plan, routeStatic } = await project({
    'button.tsx': button,
    'route.tsx': `import { Button } from './button'\nexport default function R() { const n = read(); const save = () => n + 1; return <main><Button onClick={save} /></main> }`,
  })
  expect(routeStatic).toBe(false)
  expect(plan.diagnostics).toMatchObject([{ code: 'H017', file: 'route.tsx', why: expect.stringMatching(/onClick/), fix: expect.any(String) }])
})

test('Media waits to be seen, whatever else is on the page', async () => {
  const { plan } = await project({ 'route.tsx': `import { Media } from '@weft-js/core/media'\nconst hero = { src: 'a.jpg' }\nexport default function R() { return <main><Media src={hero} alt="" /></main> }` })
  expect(plan.loads).toMatchObject([{ tag: 'Media', when: 'visible' }])
})

describe('a handler no call site is seen giving stays client', () => {
  const go = `const go = () => alert(1)\n`
  const shapes: Record<string, string> = {
    'a member of a prop': `function Action({ action }) { return <button onClick={action.onClick}>x</button> }\nexport default function R() { return <Action action={{ onClick: go }} /> }`,
    'a prop of a prop': `function Action(props) { return <button onClick={props.action.onClick}>x</button> }\nexport default function R() { return <Action action={{ onClick: go }} /> }`,
    'a default': `function Btn({ onClick = go }) { return <button onClick={onClick}>x</button> }\nexport default function R() { return <Btn /> }`,
    'a default on the whole parameter': `function Btn(props = { onClick: go }) { return <button onClick={props.onClick}>x</button> }\nexport default function R() { return <Btn /> }`,
    'a helper that is called': `const pill = ({ onClick }) => <button onClick={onClick}>x</button>\nexport default function R() { return <main>{pill({ onClick: go })}</main> }`,
    'a component that is called': `function Pill({ onClick }) { return <button onClick={onClick}>x</button> }\nexport default function R() { return <main>{Pill({ onClick: go })}</main> }`,
    'a positional parameter': `function Row(label, onClick) { return <button onClick={onClick}>{label}</button> }\nexport default function R() { return <main>{Row('x', go)}</main> }`,
    'a rename': `function Btn({ action: onClick }) { return <button onClick={onClick}>x</button> }\nexport default function R() { return <Btn action={go} /> }`,
    'a reassigned prop': `function Btn({ onClick }) { onClick = go; return <button onClick={onClick}>x</button> }\nexport default function R() { return <Btn /> }`,
    'a member written': `function Btn(props) { props.onClick = go; return <button onClick={props.onClick}>x</button> }\nexport default function R() { return <Btn /> }`,
    'a nested destructure': `function Btn({ cfg: { onClick } }) { return <button onClick={onClick}>x</button> }\nexport default function R() { return <Btn cfg={{ onClick: go }} /> }`,
    'props handed to a call': `function Div(props) { Object.assign(props, { onClick: go }); return <div {...props}>x</div> }\nexport default function R() { return <Div /> }`,
    'props in a local': `function Div(props) { const p = props; p.onClick = go; return <div {...props}>x</div> }\nexport default function R() { return <Div /> }`,
    'arguments': `function Div(props) { arguments[0].onClick = go; return <div {...props}>x</div> }\nexport default function R() { return <Div /> }`,
    'a component mapped over a list': `const list = [{ onClick: go }]\nfunction Pill({ onClick }) { return <button onClick={onClick}>x</button> }\nexport default function R() { return <main>{list.map(Pill)}</main> }`,
    'a table read as a value': `function Pill({ onClick }) { return <button onClick={onClick}>x</button> }\nconst KIT = { pill: Pill }\nexport default function R() { return <main>{KIT.pill({ onClick: go })}</main> }`,
    'an alias that is called': `function Pill({ onClick }) { return <button onClick={onClick}>x</button> }\nconst Press = Pill\nexport default function R() { return <main>{Press({ onClick: go })}</main> }`,
    'a wrapper that gives the handler': `const wrap = f => () => f({ onClick: go })\nconst Pill = wrap(({ onClick }) => <button onClick={onClick}>x</button>)\nexport default function R() { return <Pill /> }`,
    'a class method': `class View { Render({ onClick }) { return <button onClick={onClick}>x</button> } }\nexport default function R() { return <main>{new View().Render({ onClick: go })}</main> }`,
    'a called wrapper that spreads its props onto a tag': `function Btn(props) { return <button {...props}>x</button> }\nfunction Wrap(props) { return <Btn {...props} /> }\nexport default function R() { return <main>{Wrap({ onClick: go })}</main> }`,
    'a table whose method calls what it holds': `function Btn({ onClick }) { return <button onClick={onClick}>x</button> }\nconst KIT = { btn: Btn, Go() { return this.btn({ onClick: go }) } }\nexport default function R() { return <KIT.Go /> }`,
    'a dynamic import read as it renders': `const { Pill } = await import('./pill')\nexport default function R() { return <main>{Pill({ onClick: go })}</main> }`,
    'a spread of a literal': `export default function R() { return <button {...{ onClick: go }}>x</button> }`,
    'a spread of a module value': `const a = { onClick: go }\nexport default function R() { return <button {...a}>x</button> }`,
    'a spread of a prop\'s member': `function Div(p) { return <div {...p.attrs}>x</div> }\nexport default function R() { return <Div attrs={{ onClick: go }} /> }`,
    'a spread of a named prop': `function Div({ attrs }) { return <div {...attrs}>x</div> }\nexport default function R() { return <Div attrs={{ onClick: go }} /> }`,
  }
  test.each(Object.keys(shapes))('%s', async name => {
    const { plan, routeStatic } = await project({ 'route.tsx': go + shapes[name], 'pill.tsx': `export function Pill({ onClick }) { return <button onClick={onClick}>x</button> }` })
    expect(routeStatic && plan.islands.length === 0).toBe(false)
  })

  test('an `import()` a handler runs waits for that handler', async () => {
    const { plan, routeStatic } = await project({
      'open.tsx': `export function Open() { return <button onClick={() => import('./dialog')}>x</button> }`,
      'dialog.tsx': `export const a = 1`,
      'route.tsx': `import { Open } from './open'\nexport default function R() { return <main><Open /></main> }`,
    })
    expect(routeStatic).toBe(true)
    expect(plan.loads).toMatchObject([{ tag: 'Open', when: 'interaction' }])
  })
})

test('tags are all that reach a forwarding component, through a table and a local too', async () => {
  const { plan, why, routeStatic } = await project({
    'kit.tsx': `function Div({ children, ...rest }) { return <div {...rest}>{children}</div> }\nconst TAGS = { div: Div }\nexport function Box({ as, ...rest }) { const Tag = TAGS[as ?? 'div']; return <Tag {...rest} /> }\nexport function Press({ onPress: run, children }) { return <button onClick={run}>{children}</button> }\nexport { Press as Alias }`,
    'route.tsx': `import { Box, Alias } from './kit'\nexport default function R() { return <Box><Alias>x</Alias></Box> }`,
  })
  expect(routeStatic).toBe(true)
  expect(plan.islands).toEqual([])
  expect(why('Box') ?? null).toBe(null)
})

test('a table read as a value frees what it holds, from another file too', async () => {
  const { why } = await project({
    'kit.tsx': `function Pill({ onClick }) { return <button onClick={onClick}>x</button> }\nexport const KIT = { pill: Pill }`,
    'route.tsx': `import { KIT } from './kit'\nconst go = () => {}\nexport default function R() { return <main>{KIT.pill({ onClick: go })}</main> }`,
  })
  expect(why('Pill')).toMatch(/onClick/)
})
