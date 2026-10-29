// The corpus oracle (research 19 §5): every component in the repo plus a generated corpus, rendered three ways:
// Solid's DOM output (plain imports), weft's DOM output (`?weft-next`), and weft's server render hydrated
// (`?weft-ssr` + `?weft-hydrate`). After mounting and after every scripted interaction (click each button, type in
// each input) the three DOMs must match, comments, attribute order and class order aside. Hydration must claim
// everything (0 misses) without writing to the DOM. Solid's back end leaves with step 5, and this test with it.
import { renderToString } from 'weft/ssr'
import { hydrate } from 'weft/dom'
import { flush, render } from 'weft/test'
import { hydration } from '../src/hydrate'

type Comp = (props: any) => any
type Case = {
  name: string
  props: () => any
  solid: Comp
  next: Comp
  server: Comp
  client: Comp
  /** Buttons the script leaves alone (`selector`). */
  skip?: string
  /** Solid's output is wrong here: compare weft's two renders only. */
  solidWrong?: string
}

const pick = (mods: Record<string, any>, query: string) =>
  Object.fromEntries(Object.entries(mods).map(([path, mod]) => [path.replace(query, '').replace(/^.*\//, ''), mod]))

// Generated corpus (test/oracle.setup.ts writes it).
const corpus = {
  solid: pick(import.meta.glob('./corpus-gen/C*.tsx', { eager: true }), ''),
  next: pick(import.meta.glob('./corpus-gen/C*.tsx', { eager: true, query: '?weft-next' }), '?weft-next'),
  server: pick(import.meta.glob('./corpus-gen/C*.tsx', { eager: true, query: '?weft-ssr' }), '?weft-ssr'),
  client: pick(import.meta.glob('./corpus-gen/C*.tsx', { eager: true, query: '?weft-hydrate' }), '?weft-hydrate'),
}
const fields = { title: 'Alpha', status: 'open', owner: 'ada', price: 3, count: 2, label: 'first', updated: 'today', score: 0 }
const items = () => [
  { id: 'a', ...fields },
  { id: 'b', ...fields, title: 'Beta', price: 0, score: 7, label: '' },
  { id: 'c', ...fields, title: 'Gamma <g>', owner: 'grace & co', count: 0 },
]
const cases: Case[] = Object.keys(corpus.solid).map(file => {
  const name = Object.keys(corpus.solid[file])[0]
  const of = (k: keyof typeof corpus) => corpus[k][file][name]
  return { name: `corpus ${name}`, props: () => ({ items: items(), title: name }), solid: of('solid'), next: of('next'), server: of('server'), client: of('client') }
})

// Repo components, with the props they need.
import * as basics from './fixtures/next/Basics'
// @ts-expect-error: query imports (vite.mjs)
import * as basicsNext from './fixtures/next/Basics.tsx?weft-next'
// @ts-expect-error
import * as basicsServer from './fixtures/next/Basics.tsx?weft-ssr'
// @ts-expect-error
import * as basicsClient from './fixtures/next/Basics.tsx?weft-hydrate'
import * as two from './fixtures/next/Step2'
// @ts-expect-error
import * as twoNext from './fixtures/next/Step2.tsx?weft-next'
// @ts-expect-error
import * as twoServer from './fixtures/next/Step2.tsx?weft-ssr'
// @ts-expect-error
import * as twoClient from './fixtures/next/Step2.tsx?weft-hydrate'
import * as bench from './fixtures/next/Bench'
// @ts-expect-error
import * as benchNext from './fixtures/next/Bench.tsx?weft-next'
// @ts-expect-error
import * as benchServer from './fixtures/next/Bench.tsx?weft-ssr'
// @ts-expect-error
import * as benchClient from './fixtures/next/Bench.tsx?weft-hydrate'
import * as shop from './fixtures/ssr/Shop'
// @ts-expect-error
import * as shopNext from './fixtures/ssr/Shop.tsx?weft-next'
// @ts-expect-error
import * as shopServer from './fixtures/ssr/Shop.tsx?weft-ssr'
// @ts-expect-error
import * as shopClient from './fixtures/ssr/Shop.tsx?weft-hydrate'

const products = [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana & co', category: 'fruit', price: 0.25, stock: 3 },
  { id: 'yogurt', name: 'Yogurt "plain"', category: 'dairy', price: 0.9, stock: 0 },
]
const repo = (name: string, key: string, mods: any[], props: () => any = () => ({}), extra: Partial<Case> = {}): Case => {
  const [solid, next, server, client] = mods.map(m => m[key])
  return { name, props, solid, next, server, client, ...extra }
}
const basicsMods = [basics, basicsNext, basicsServer, basicsClient]
const twoMods = [two, twoNext, twoServer, twoClient]
cases.unshift(
  repo('Basics Hello', 'Hello', basicsMods),
  repo('Basics Counter', 'Counter', basicsMods),
  repo('Basics Panel', 'Panel', basicsMods),
  repo('Step2 Toggle', 'Toggle', twoMods),
  repo('Step2 Picker', 'Picker', twoMods),
  // A component returning <circle> outside <svg>: Solid's template parses `<circle>` as HTML and nests it oddly.
  repo('Step2 Icon', 'Icon', twoMods, undefined, { solidWrong: 'an SVG root outside <svg>' }),
  repo('benchmark app', 'Main', [bench, benchNext, benchServer, benchClient], undefined, { skip: '#runlots' }), // 10,000 rows ×3 is slow
  repo('v3 shop (loaded)', 'Shop', [shop, shopNext, shopServer, shopClient], () => ({
    products,
    cart: { apple: { qty: 2, addedPrice: 0.4 } },
    filters: { search: '', category: 'all', sort: 'price-asc' },
  })),
)

// ---- comparing ------------------------------------------------------------------------------------------------

const norm = (name: string, v: string) =>
  name === 'class' ? v.split(/\s+/).filter(Boolean).sort().join(' ') : name === 'style' ? v.replace(/\s+/g, '').replace(/;$/, '') : v

const html = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  const walk = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walk.nextNode()) comments.push(walk.currentNode)
  for (const c of comments) c.remove()
  copy.normalize()
  // A form control's value is its property: the server writes it as an attribute (and `selected` on the option),
  // the DOM sets the property.
  const live = [...el.querySelectorAll('*')]
  copy.querySelectorAll('*').forEach((e, i) => {
    if ('value' in live[i] && /^(input|textarea|select)$/.test(e.localName)) e.setAttribute('value', (live[i] as HTMLInputElement).value)
  })
  for (const e of copy.querySelectorAll('*')) {
    const attrs = [...e.attributes].filter(a => a.name !== 'wk' && !(a.name === 'selected' && e.localName === 'option')).map(a => [a.name, norm(a.name, a.value)])
    for (const a of [...e.attributes]) e.removeAttribute(a.name)
    for (const [n, v] of attrs.sort(([a], [b]) => (a < b ? -1 : 1))) e.setAttribute(n, v)
  }
  return copy.innerHTML
}

let seed = () => {}
beforeEach(() => {
  let n = 0
  const random = vi.spyOn(Math, 'random').mockImplementation(() => ((n = (n * 16807 + 1) % 2147483647) / 2147483647))
  seed = () => void (n = 1)
  return () => random.mockRestore()
})

/** The same interaction on each root: the i-th button or input as it is now. */
const steps = (root: Element, skip?: string) => {
  const out: ((r: Element) => void)[] = []
  root.querySelectorAll('button').forEach((b, i) => {
    if (!skip || !b.matches(skip)) out.push(r => r.querySelectorAll('button')[i]?.click())
  })
  root.querySelectorAll('input').forEach((_, i) =>
    out.push(r => {
      const input = r.querySelectorAll('input')[i]
      if (!input) return
      input.value += 'a'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }),
  )
  return out
}

test.each(cases.map(c => [c.name, c]))('%s: Solid DOM = weft DOM = weft SSR + hydrate, through every interaction', async (_, c) => {
  const b = render(c.next, c.props()).container
  const a = c.solidWrong ? b : render(c.solid, c.props()).container
  const server = renderToString(() => c.server(c.props()))
  const h = document.body.appendChild(document.createElement('div'))
  h.innerHTML = server
  const mutations: MutationRecord[] = []
  const observer = new MutationObserver(r => mutations.push(...r))
  observer.observe(h, { subtree: true, childList: true, attributes: true, characterData: true })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const dispose = hydrate(() => c.client(c.props()), h)
  mutations.push(...observer.takeRecords())
  observer.disconnect()
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
  expect(hydration.misses).toBe(0)
  expect(mutations).toHaveLength(0)
  h.querySelector('script[data-weft]')?.remove()

  const want = html(a)
  expect(html(b)).toBe(want)
  expect(html(h)).toBe(want)
  for (const step of steps(a, c.skip)) {
    for (const root of new Set([a, b, h])) {
      seed() // the same "random" rows in each (the benchmark app)
      step(root)
    }
    await flush()
    const now = html(a)
    expect(html(b)).toBe(now)
    expect(html(h)).toBe(now)
  }
  dispose()
})
