// HMR (PLAN §3.6, research 21): a module update swaps components in place and keeps their state.
// weft-allow T005: framework test of HMR; which DOM nodes survive a swap is the subject
//
// Each "module" is source text compiled by the real compiler (dev, `hmr`) and evaluated with a fake `import.meta.hot`,
// the way Vite re-executes an accepted module: same file name, a new module instance, importers left as they were.
import { createRequire } from 'node:module'
import * as core from 'weft'
import { defineState, flush, onCleanup, onMount, state, watch } from 'weft'
import * as dom from 'weft/dom'
import { component, render } from 'weft/dom'
import * as hmr from 'weft/hmr'
import { hmrStats } from 'weft/hmr'

const { transform } = createRequire(import.meta.url)('../compiler.cjs')

type Exports = Record<string, any>
const modules: Record<string, Exports> = {
  weft: { ...core, defineState, onCleanup, onMount, state, watch },
  'weft/dom': dom,
  'weft/hmr': hmr,
}

/** Compile `source` as `file` and run it; its exports become importable as `file`. */
function load(file: string, source: string, compile = { dev: true, hmr: true }) {
  const out = transform(source, { filename: file, generate: 'dom', ...compile })
  if (!out.code) throw new Error(JSON.stringify(out.diagnostics))
  const hot = { accepted: false, accept() { hot.accepted = true } }
  const imports: string[] = []
  const names: string[] = []
  let code = out.code
    .replace(/^import \{([^}]*)\} from "([^"]+)";$/gm, (_: string, specs: string, from: string) => {
      imports.push(`const {${specs.replace(/\bas\b/g, ':')}} = __m[${JSON.stringify(from)}];`)
      return ''
    })
    .replace(/^export (default )?(function|const) (\w+)/gm, (_: string, _d: string, kind: string, name: string) => (names.push(name), `${kind} ${name}`))
    .replace(/import\.meta\.hot/g, '__hot')
  code = `${imports.join('\n')}\n${code}\nreturn { ${names.join(', ')} };`
  const exports = new Function('__m', '__hot', code)(modules, hot) as Exports
  modules[file] = exports
  return { exports, hot, code: out.code as string }
}

let disposers: (() => void)[] = []
function mount(App: any) {
  const el = document.body.appendChild(document.createElement('div'))
  disposers.push(render(() => component(App, {}, 'App', 'test'), el), () => el.remove())
  return el
}
afterEach(() => {
  for (const d of disposers) d()
  disposers = []
})

let n = 0
/** A fresh file name per test, so registry entries from one test never meet another's. */
const file = (name: string) => `/app/t${++n}/${name}`

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('compiled output', () => {
  test('components register; a component-only module accepts its own updates', () => {
    const { code, hot } = load(file('Counter.tsx'), `
      import { state } from 'weft'
      export function Counter() { const count = state(0); return <button>{count.value}</button> }`)
    expect(code).toMatch(/_\$keep\(state\(0\), "Counter", "count:[0-9a-f]+"\)/)
    expect(code).toContain('_$hot(')
    expect(hot.accepted).toBe(true)
  })

  test('a module that exports state, or mounts the app, passes the update to its importers', () => {
    const store = load(file('store.tsx'), `
      import { state } from 'weft'
      export const shared = state(0)
      export function Badge() { return <b>{shared.value}</b> }`)
    expect(store.hot.accepted).toBe(false)
    const entry = load(file('main.tsx'), `
      import { render } from 'weft/dom'
      function App() { return <p>hi</p> }
      const el = document.createElement('div')
      render(() => <App />, el)`)
    expect(entry.hot.accepted).toBe(false)
  })

  test('production and non-hmr output carry none of it', () => {
    const src = `import { state } from 'weft'\nexport function C() { const s = state(0); return <i>{s.value}</i> }`
    for (const compile of [{ dev: false, hmr: true }, { dev: true, hmr: false }]) {
      const out = transform(src, { filename: '/app/C.tsx', generate: 'dom', ...compile }).code as string
      expect(out).not.toMatch(/_\$keep|_\$hot|weft\/hmr|import\.meta\.hot/)
    }
    const ssr = transform(src, { filename: '/app/C.tsx', generate: 'ssr', dev: true, hmr: true }).code as string
    expect(ssr).not.toMatch(/_\$keep|weft\/hmr/)
  })
})

describe('updates', () => {
  const counter = (label: string, init = '0', name = 'count') => `
    import { state } from 'weft'
    export function Counter() {
      const ${name} = state(${init})
      return <button onClick={() => ${name}.value++}>${label} {${name}.value}</button>
    }`

  function app(counterFile: string) {
    return load(file('App.tsx'), `
      import { Counter } from ${JSON.stringify(counterFile)}
      export function App() { return <main><h1>title</h1><Counter /></main> }`).exports.App
  }

  test('a markup edit updates the DOM and keeps the count', () => {
    const f = file('Counter.tsx')
    load(f, counter('Count:'))
    const el = mount(app(f))
    const button = () => el.querySelector('button')!
    click(button()); click(button()); click(button())
    flush()
    expect(button().textContent).toBe('Count: 3')
    const h1 = el.querySelector('h1')
    load(f, counter('Clicks:'))
    flush()
    expect(button().textContent).toBe('Clicks: 3')
    expect(el.querySelector('h1')).toBe(h1) // the parent didn't re-render
    click(button())
    flush()
    expect(button().textContent).toBe('Clicks: 4')
  })

  test('changing a box initializer, or renaming it, resets it', () => {
    const f = file('Counter.tsx')
    load(f, counter('Count:'))
    const el = mount(app(f))
    const button = () => el.querySelector('button')!
    click(button()); flush()
    expect(button().textContent).toBe('Count: 1')
    load(f, counter('Count:', '10'))
    flush()
    expect(button().textContent).toBe('Count: 10')
    click(button()); flush()
    load(f, counter('Count:', '10', 'clicks'))
    flush()
    expect(button().textContent).toBe('Count: 10')
  })

  test('an edit to a parent keeps the state of the children it re-creates', () => {
    const f = file('Page.tsx')
    const page = (title: string) => `
      import { state } from 'weft'
      function Item(props) { const n = state(0); return <li onClick={() => n.value++}>{props.label} {n.value}</li> }
      export function Page() { const open = state(true); return <section><h2>${title}</h2><ul><Item label="a" /><Item label="b" /></ul></section> }`
    const { exports } = load(f, page('One'))
    const el = mount(exports.Page)
    const items = () => [...el.querySelectorAll('li')]
    click(items()[1]); click(items()[1]); flush()
    expect(items().map(li => li.textContent)).toEqual(['a 0', 'b 2'])
    load(f, page('Two'))
    flush()
    expect(el.querySelector('h2')!.textContent).toBe('Two')
    expect(items().map(li => li.textContent)).toEqual(['a 0', 'b 2'])
  })

  test('only the edited component re-runs', () => {
    const f = file('Two.tsx')
    const two = (b: string) => `
      export function A() { return <p>a</p> }
      export function B() { return <p>${b}</p> }`
    const { exports } = load(f, two('b'))
    const Both = () => [component(exports.A, {}, 'A'), component(exports.B, {}, 'B'), component(exports.B, {}, 'B')]
    const el = mount(Both)
    hmrStats.reruns = 0
    load(f, two('b2'))
    flush()
    expect(el.textContent).toBe('ab2b2')
    expect(hmrStats.reruns).toBe(2)
  })

  test('an edit outside any component re-renders the module\'s components', () => {
    const f = file('Label.tsx')
    const mod = (text: string) => `
      const TEXT = ${JSON.stringify(text)}
      export function Label() { return <span>{TEXT}</span> }`
    const { exports } = load(f, mod('one'))
    const el = mount(exports.Label)
    load(f, mod('two'))
    flush()
    expect(el.textContent).toBe('two')
  })

  test('no duplicate listeners or leaked effects after many updates', () => {
    const f = file('Keys.tsx')
    const keys = (label: string) => `
      import { state, watch, onMount, onCleanup } from 'weft'
      export function Keys() {
        const count = state(0)
        const onKey = () => { globalThis.__keys++ }
        onMount(() => document.addEventListener('keydown', onKey))
        onCleanup(() => document.removeEventListener('keydown', onKey))
        watch(() => count.value, () => { globalThis.__runs++ })
        return <button onClick={() => count.value++}>${label} {count.value}</button>
      }`
    const g = globalThis as any
    g.__keys = 0
    g.__runs = 0
    load(f, keys('v0'))
    const el = mount(load(file('App.tsx'), `
      import { Keys } from ${JSON.stringify(f)}
      export function App() { return <div><Keys /></div> }`).exports.App)
    for (let i = 1; i <= 5; i++) {
      load(f, keys(`v${i}`))
      flush()
    }
    expect(el.querySelectorAll('button')).toHaveLength(1)
    g.__keys = 0
    g.__runs = 0
    document.dispatchEvent(new KeyboardEvent('keydown'))
    click(el.querySelector('button')!)
    flush()
    expect(g.__keys).toBe(1)
    expect(g.__runs).toBe(1)
    expect(el.querySelector('button')!.textContent).toBe('v5 1')
  })

  test('a component that throws while updating keeps its last output', () => {
    const f = file('Boom.tsx')
    const { exports } = load(f, `export function Boom() { return <p>ok</p> }`)
    const el = mount(exports.Boom)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    load(f, `export function Boom() { throw new Error('typo') }`)
    flush()
    expect(el.textContent).toBe('ok')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
    load(f, `export function Boom() { return <p>fixed</p> }`)
    flush()
    expect(el.textContent).toBe('fixed')
  })

  test('defineState scopes survive their module re-running', () => {
    const f = file('cart.tsx')
    const cart = (label: string) => `
      import { defineState, state } from 'weft'
      export const cart = defineState('hmr-cart-${n}', () => { const lines = state(0); return { lines, add() { lines.value++ } } })
      export function Lines() { return <p>${label} {cart.lines.value}</p> }`
    const first = load(f, cart('lines')).exports
    const el = mount(first.Lines)
    first.cart.add(); first.cart.add()
    flush()
    expect(el.textContent).toBe('lines 2')
    const second = load(f, cart('items')).exports
    flush()
    expect(second.cart).toBe(first.cart)
    expect(el.textContent).toBe('items 2')
  })
})

describe('gate: HMR with 1k mounted components (PLAN §3.7, ≤ 50 ms p95)', () => {
  test('editing one of 1k components: compile + module run + DOM update', () => {
    const N = 1000
    const dir = `/app/gate${++n}`
    const comp = (i: number, label: string) => `
      import { state } from 'weft'
      export function C${i}(props) {
        const count = state(${i})
        return <li class="row" onClick={() => count.value++}><b>${label}</b> {props.label} {count.value}</li>
      }`
    for (let i = 0; i < N; i++) load(`${dir}/C${i}.tsx`, comp(i, `c${i}`))
    const imports = Array.from({ length: N }, (_, i) => `import { C${i} } from "${dir}/C${i}.tsx"`).join('\n')
    const kids = Array.from({ length: N }, (_, i) => `<C${i} label="x" />`).join('')
    const App = load(`${dir}/App.tsx`, `${imports}\nexport function App() { return <ul>${kids}</ul> }`).exports.App
    const el = mount(App)
    expect(el.querySelectorAll('li')).toHaveLength(N)

    const times: number[] = []
    for (let r = 0; r < 60; r++) {
      const i = (r * 397) % N
      const t0 = performance.now()
      load(`${dir}/C${i}.tsx`, comp(i, `edit${r}`))
      flush()
      const li = el.querySelectorAll('li')[i]
      times.push(performance.now() - t0)
      expect(li.firstChild!.textContent).toBe(`edit${r}`)
      expect(li.textContent).toBe(`edit${r} x ${i}`)
    }
    times.sort((a, b) => a - b)
    const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]
    console.log(`hmr gate (1k components, jsdom): p50 ${p(0.5).toFixed(2)} ms, p95 ${p(0.95).toFixed(2)} ms, max ${times.at(-1)!.toFixed(2)} ms`)
    expect(p(0.95)).toBeLessThan(50)
  })
})
