// The corpus oracle (research 19 §5.4): repo components plus a generated corpus, rendered by kerf's DOM output and
// by its server render hydrated (`?kerf-ssr` + `?kerf-hydrate`). Hydration must claim everything (0 misses) without
// writing to the DOM. After mounting and after every scripted interaction (click each button, type in each input)
// both DOMs must match each other and what Solid's back end built for the same script, recorded before step 5
// deleted it (oracle.golden.json). Comments, attribute order and class order are left out of the comparison.
// kerf-allow T005, T008: differential oracle; it compares raw DOM, and cases without a recorded trace skip that check
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToString } from '@kerf-js/core/ssr'
import { hydrate } from '@kerf-js/core/dom'
import { flush, render } from '@kerf-js/core/test'
import { hydration } from '../src/hydrate'
import * as basics from './fixtures/next/Basics'
import * as basicsServer from './fixtures/next/Basics.tsx?kerf-ssr'
import * as basicsClient from './fixtures/next/Basics.tsx?kerf-hydrate'
import * as two from './fixtures/next/Step2'
import * as twoServer from './fixtures/next/Step2.tsx?kerf-ssr'
import * as twoClient from './fixtures/next/Step2.tsx?kerf-hydrate'
import * as bench from './fixtures/next/Bench'
import * as benchServer from './fixtures/next/Bench.tsx?kerf-ssr'
import * as benchClient from './fixtures/next/Bench.tsx?kerf-hydrate'
import * as shop from './fixtures/ssr/Shop'
import * as shopServer from './fixtures/ssr/Shop.tsx?kerf-ssr'
import * as shopClient from './fixtures/ssr/Shop.tsx?kerf-hydrate'

type Comp = (props: never) => unknown
type Case = {
  name: string
  props: () => unknown
  dom: Comp
  server: Comp
  client: Comp
  /** Buttons the script leaves alone (`selector`). */
  skip?: string
  /** Solid's output was wrong here (none recorded): compare kerf's two renders only. */
  solidWrong?: string
}

const pick = (mods: Record<string, unknown>, query: string) =>
  Object.fromEntries(
    Object.entries(mods).map(([path, mod]) => [
      path.replace(query, '').replace(/^.*\//, ''),
      mod as Record<string, Comp>,
    ]),
  )

// Generated corpus (test/oracle.setup.ts writes it).
const corpus = {
  dom: pick(import.meta.glob('./corpus-gen/C*.tsx', { eager: true }), ''),
  server: pick(
    import.meta.glob('./corpus-gen/C*.tsx', { eager: true, query: '?kerf-ssr' }),
    '?kerf-ssr',
  ),
  client: pick(
    import.meta.glob('./corpus-gen/C*.tsx', { eager: true, query: '?kerf-hydrate' }),
    '?kerf-hydrate',
  ),
}
const fields = {
  title: 'Alpha',
  status: 'open',
  owner: 'ada',
  price: 3,
  count: 2,
  label: 'first',
  updated: 'today',
  score: 0,
}
const items = () => [
  { id: 'a', ...fields },
  { id: 'b', ...fields, title: 'Beta', price: 0, score: 7, label: '' },
  { id: 'c', ...fields, title: 'Gamma <g>', owner: 'grace & co', count: 0 },
]
const cases: Case[] = Object.keys(corpus.dom).map((file) => {
  const name = Object.keys(corpus.dom[file]!)[0]!
  const of = (k: keyof typeof corpus) => corpus[k][file]![name]!
  return {
    name: `corpus ${name}`,
    props: () => ({ items: items(), title: name }),
    dom: of('dom'),
    server: of('server'),
    client: of('client'),
  }
})

// Repo components, with the props they need.

const products = [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana & co', category: 'fruit', price: 0.25, stock: 3 },
  { id: 'yogurt', name: 'Yogurt "plain"', category: 'dairy', price: 0.9, stock: 0 },
]
const repo = (
  name: string,
  key: string,
  mods: object[],
  props: () => unknown = () => ({}),
  extra: Partial<Case> = {},
): Case => {
  const [dom, server, client] = mods.map((m) => (m as Record<string, Comp>)[key]!) as [
    Comp,
    Comp,
    Comp,
  ]
  return { name, props, dom, server, client, ...extra }
}
const basicsMods = [basics, basicsServer, basicsClient]
const twoMods = [two, twoServer, twoClient]
cases.unshift(
  repo('Basics Hello', 'Hello', basicsMods),
  repo('Basics Counter', 'Counter', basicsMods),
  repo('Basics Panel', 'Panel', basicsMods),
  repo('Step2 Toggle', 'Toggle', twoMods),
  repo('Step2 Picker', 'Picker', twoMods),
  // A component returning <circle> outside <svg>: Solid's DOM output nested it as `<svg r="2"><circle>`.
  repo('Step2 Icon', 'Icon', twoMods, undefined, { solidWrong: 'an SVG root outside <svg>' }),
  repo('benchmark app', 'Main', [bench, benchServer, benchClient], undefined, { skip: '#runlots' }), // 10,000 rows is slow
  repo('v3 shop (loaded)', 'Shop', [shop, shopServer, shopClient], () => ({
    products,
    cart: { apple: { qty: 2, addedPrice: 0.4 } },
    filters: { search: '', category: 'all', sort: 'price-asc' },
  })),
)

// ---- comparing ------------------------------------------------------------------------------------------------

const norm = (name: string, v: string) =>
  name === 'class'
    ? v.split(/\s+/).filter(Boolean).sort().join(' ')
    : name === 'style'
      ? v.replace(/\s+/g, '').replace(/;$/, '')
      : v

const html = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  const walk = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walk.nextNode()) comments.push(walk.currentNode)
  for (const c of comments) (c as ChildNode).remove()
  copy.normalize()
  // A form control's value is its property: the server writes it as an attribute (and `selected` on the option),
  // the DOM sets the property.
  const live = [...el.querySelectorAll('*')]
  copy.querySelectorAll('*').forEach((e, i) => {
    if ('value' in live[i]! && /^(input|textarea|select)$/.test(e.localName))
      e.setAttribute('value', (live[i] as HTMLInputElement).value)
  })
  for (const e of copy.querySelectorAll('*')) {
    const attrs = [...e.attributes]
      .filter((a) => a.name !== 'wk' && !(a.name === 'selected' && e.localName === 'option'))
      .map((a) => [a.name, norm(a.name, a.value)] as const)
    // the copy: attributes is live and this empties it
    for (const a of [...e.attributes]) e.removeAttribute(a.name)
    for (const [n, v] of attrs.sort(([a], [b]) => (a < b ? -1 : 1))) e.setAttribute(n, v)
  }
  return copy.innerHTML
}

let seed = () => {}
beforeEach(() => {
  let n = 0
  const random = vi
    .spyOn(Math, 'random')
    .mockImplementation(() => (n = (n * 16807 + 1) % 2147483647) / 2147483647)
  seed = () => void (n = 1)
  return () => random.mockRestore()
})

/** The same interaction on each root: the i-th button or input as it is now. */
const steps = (root: Element, skip?: string) => {
  const out: ((r: Element) => void)[] = []
  root.querySelectorAll('button').forEach((b, i) => {
    if (!skip || !b.matches(skip)) out.push((r) => r.querySelectorAll('button')[i]?.click())
  })
  root.querySelectorAll('input').forEach((_, i) =>
    out.push((r) => {
      const input = r.querySelectorAll('input')[i]
      if (!input) return
      input.value += 'a'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }),
  )
  return out
}

// Solid's DOM after mount and after each step, per case (long ones as hashes). Recorded with Solid's back end and
// this same script before step 5 deleted it. A component or script change needs a reviewed edit here.
const golden: Record<string, string[]> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'oracle.golden.json'), 'utf8'),
)
const digest = (text: string) =>
  text.length <= 1500 ? text : `sha256:${createHash('sha256').update(text).digest('hex')}`

test.each(cases.map((c) => [c.name, c]))(
  '%s: kerf DOM = kerf SSR + hydrate = Solid (recorded), through every interaction',
  async (_, c) => {
    const started = performance.now()
    let last = started
    const mark = (phase: string) => {
      if (c.name !== 'benchmark app') return
      const now = performance.now()
      process.stderr.write(
        `oracle-timing ${JSON.stringify({ phase, ms: now - last, totalMs: now - started })}\n`,
      )
      last = now
    }
    mark('start')
    const a = render(c.dom, c.props() as never).container
    mark('dom mount')
    const server = renderToString(() => c.server(c.props() as never))
    mark('server render')
    const h = document.body.appendChild(document.createElement('div'))
    h.innerHTML = server
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((r) => mutations.push(...r))
    observer.observe(h, { subtree: true, childList: true, attributes: true, characterData: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = hydrate(() => c.client(c.props() as never), h)
    mark('hydrate')
    mutations.push(...observer.takeRecords())
    observer.disconnect()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    expect(hydration.misses).toBe(0)
    expect(mutations).toHaveLength(0)
    h.querySelector('script[data-kerf]')?.remove()

    const want = c.solidWrong ? undefined : golden[c.name]
    if (!c.solidWrong) expect(want, 'a recorded trace').toBeDefined()
    const initial = html(a)
    const trace = [digest(initial)]
    expect(html(h)).toBe(initial)
    mark('initial comparison')
    for (const [index, step] of steps(a, c.skip).entries()) {
      mark(`step ${index} start`)
      for (const root of [a, h]) {
        seed() // the same "random" rows in each (the benchmark app)
        step(root)
      }
      mark(`step ${index} interactions`)
      await flush()
      mark(`step ${index} flush`)
      const current = html(a)
      trace.push(digest(current))
      expect(html(h)).toBe(current)
      mark(`step ${index} comparison`)
    }
    if (want) expect(trace).toEqual(want)
    mark('golden comparison')
    dispose()
    mark('dispose')
  },
  30_000, // the benchmark app's thousands of rows take seconds through jsdom on a loaded gate
)
