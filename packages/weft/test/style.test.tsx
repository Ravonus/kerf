// Style groups (research 23, @weft-js/core/style): the compiler lowers call sites to attributes, the emitter writes CSS for
// the values call sites can produce, a reactive axis is one attribute write, and SSR → hydrate claims the attributes
// with no writes. The groups shop is spikes/style-groups/shop-groups.
// weft-allow T005: framework test of compiled markup, SSR and hydration; attributes and node identity are the subject
import { screen } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { renderToString } from '@weft-js/core/ssr'
import { hydrate } from '@weft-js/core/dom'
import { flush, render, touches } from '@weft-js/core/test'
import { group } from '@weft-js/core/style'
import { hydration } from '../src/hydrate'
import { emitGroups, GroupError, resolve, type GroupSource, type GroupUse } from '../src/style/css'
// @ts-expect-error: query imports (vite.mjs)
import { GroupShop as ServerShop } from './fixtures/ssr/GroupShop.tsx?weft-ssr'
// @ts-expect-error
import { GroupShop as ClientShop } from './fixtures/ssr/GroupShop.tsx?weft-hydrate'
import type { Product } from '../../../evals/reference-v3/weft/src/api'

const { transform } = require('../compiler.cjs') as { transform: (s: string, o: object) => { code: string | null; diagnostics: { code: string; message: string }[]; facts: { groups: GroupSource[]; groupUses: GroupUse[] } } }

const badge = group('badge', {
  base: { layout: 'inline', padInline: 'related', radius: 'round', text: 'caption', emphasis: 'soft' },
  axes: { status: { open: { tone: 'info' }, late: { tone: 'critical' }, done: { tone: 'positive' } } },
  parts: { icon: { ink: 'tone' } },
  defaults: { status: 'open' },
})

afterEach(() => { document.body.innerHTML = '' })

const SRC = `import { group } from '@weft-js/core/style'
export const card = group('order-card', {
  base: { surface: 'raised', pad: 'group', emphasis: 'subtle' },
  axes: { status: { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } } },
  parts: { title: { text: 'title' } },
  states: { selected: { ring: 'accent' } },
  defaults: { status: 'open' },
})
export const Card = (props) => <article {...card({ status: props.status, selected: props.selected })}><h3 {...card.title}>{props.name}</h3></article>
export const Late = () => <article {...card({ status: 'late' })} />
`

describe('compiler: call sites lower to attributes', () => {
  test('literal axes are static template attributes; reactive ones bind; parts are static', () => {
    const out = transform(SRC, { filename: '/app/card.tsx' })
    expect(out.diagnostics).toEqual([])
    expect(out.code).toContain('<article data-g=\\"order-card\\"><h3 data-part=\\"title\\">')
    expect(transform(SRC, { filename: '/app/card.tsx', taggedParts: true }).code).toContain('<h3 data-g=\\"order-card\\" data-part=\\"title\\">')
    expect(out.code).toContain('<article data-g=\\"order-card\\" data-status=\\"late\\">')
    expect(out.code).toMatch(/_\$attr\(_e1, "data-status", v\[0\]\)/)
    expect(out.code).toMatch(/_\$bind\(\(\) => \[props.status, props.selected \? "true" : "false"\]/)
    expect(out.code).toMatch(/_\$attr\(_e1, "aria-selected", v\[1\]\)/)
    expect(out.code).toContain('/* @__PURE__ */ group(')
    expect(out.facts.groupUses.map(u => u.axes.status ?? u.part)).toEqual([null, 'title', ['late']])
  })

  test('SSR writes the same attributes', () => {
    const out = transform(SRC, { filename: '/app/card.tsx', generate: 'ssr' })
    expect(out.code).toContain('_$attr("data-status", props.status) + _$attr("aria-selected", props.selected ? "true" : "false")')
    expect(out.code).toContain('data-g=\\"order-card\\" data-status=\\"late\\"')
  })

  test('a group from another module, through options.groups', () => {
    const def = transform(SRC, { filename: '/app/card.tsx', checkOnly: true }).facts.groups[0]
    const use = `import { card } from './card'\nexport const X = (p) => <li {...card({ status: p.ok ? 'shipped' : 'late' })}><b {...card.title} /></li>`
    const out = transform(use, { filename: '/app/list.tsx', groups: { '/app/card#card': { name: def.name, def: def.def } } })
    expect(out.diagnostics).toEqual([])
    expect(out.facts.groupUses[0].axes.status).toEqual(['shipped', 'late'])
    expect(out.code).toContain('data-part=\\"title\\"')
  })

  test('W060: a value that isn\'t a literal is named', () => {
    const out = transform(`import { group } from '@weft-js/core/style'\nconst px = 13\nexport const g = group('g', { axes: { size: { big: { pad: px } } } })`, { filename: '/a.tsx' })
    expect(out.diagnostics.map(d => d.code)).toEqual(['W060'])
    expect(out.diagnostics[0].message).toBe("group can't be evaluated at build: `px` at g.axes.size.big.pad isn't a literal")
  })

  test('D025: unknown axis values, keys and parts, with the closest names', () => {
    const bad = SRC + `export const B = () => <p {...card({ status: 'lost', colour: 'red', selcted: true })}><i {...card.titel} /></p>`
    const out = transform(bad, { filename: '/app/card.tsx' }).diagnostics.map(d => `${d.code} ${d.message} | ${(d as { help?: string }).help}`)
    expect(out).toEqual([
      "D025 `lost` isn't a value of order-card's `status` axis | Values of order-card.status: open, shipped, late.",
      'D025 group order-card has no axis or state `colour` | Axes: status. States: selected.',
      'D025 group order-card has no axis or state `selcted` | Did you mean `selected`? Axes: status. States: selected.',
      'D025 group order-card has no part `titel` | Did you mean `title`? Parts of order-card: title.',
    ])
  })

  test('D024: two group roots on one element', () => {
    const two = SRC.replace("export const card", "export const other = group('other', { base: { gap: 'tight' } })\nexport const card") + `export const T = () => <p {...card()} {...other()} />`
    expect(transform(two, { filename: '/app/card.tsx' }).diagnostics.map(d => `${d.code} ${d.message}`)).toEqual([
      'D024 two group roots on one element: order-card and other (the last `data-g` would win)',
    ])
  })

  test('an accent lowers to one static data-accent attribute, sorted by intent', () => {
    const src = SRC + `export const A = () => <article {...card({ status: 'late', accent: { radius: 'round', pad: 'tight' } })} />`
    const out = transform(src, { filename: '/app/card.tsx' })
    expect(out.diagnostics).toEqual([])
    expect(out.code).toContain('<article data-g=\\"order-card\\" data-status=\\"late\\" data-accent=\\"pad:tight radius:round\\">')
    expect(out.facts.groupUses.at(-1)).toMatchObject({ axes: { status: ['late'] }, accent: { pad: 'tight', radius: 'round' } })
    const dynamic = transform(SRC + 'const r = "round"\nexport const B = () => <i {...card({ accent: { radius: r } })} />', { filename: '/app/card.tsx' })
    expect(dynamic.diagnostics.map(d => `${d.code} ${d.message}`)).toEqual(["W060 group can't be evaluated at build: `r` in order-card's accent isn't a literal"])
  })

  test('the doc comment above a definition is kept', () => {
    const src = SRC.replace('export const card', '/**\n * A summary card\n * for one order.\n */\nexport const card')
    expect(transform(src, { filename: '/app/card.tsx', checkOnly: true }).facts.groups[0]).toMatchObject({ doc: 'A summary card for one order.', line: 6 })
    expect(transform(SRC, { filename: '/app/card.tsx', checkOnly: true }).facts.groups[0].doc).toBeNull()
  })
})

describe('CSS: only what call sites can produce', () => {
  const groups = (): GroupSource[] => transform(SRC, { filename: '/app/card.tsx', checkOnly: true }).facts.groups.map(g => ({ ...g, file: 'card.tsx' }))

  test('a literal emits its one value, in @layer app.groups, scoped, with a dev comment', () => {
    const css = emitGroups(groups(), [{ group: 'order-card', axes: { status: ['late'] }, states: [], part: null, dynamic: false }], { dev: true })
    expect(css).toContain('@layer app.groups {')
    expect(css).toContain('/* order-card · card.tsx:2 */')
    expect(css).toContain('@scope ([data-g="order-card"]) to ([data-g])')
    // the tone is folded: the late rule reads the critical token directly
    expect(css).toContain(':scope[data-status="late"] {\n      color: var(--warp-color-critical-text);')
    expect(css).not.toContain('--_text')
    expect(css).not.toContain('"open"')
    expect(css).not.toContain('aria-selected') // no site sets `selected`
    expect(css).not.toContain('data-part="title"') // nor renders the part
  })

  test('a reactive axis emits every value; tagged parts can be flat, with no @scope', () => {
    const css = emitGroups(groups(), [{ group: 'order-card', axes: { status: null }, states: ['selected'], part: null, dynamic: false }, { group: 'order-card', axes: {}, states: [], part: 'title', dynamic: false }], { scope: false, taggedParts: true })
    for (const v of ['open', 'shipped', 'late']) expect(css).toContain(`[data-status="${v}"]`)
    expect(css).toContain('[aria-selected="true"]')
    expect(css).toContain('[data-g="order-card"][data-part="title"] {')
    expect(css).not.toContain('@scope')
  })

  test('an accent emits one rule per word, after the group\'s own rules', () => {
    const css = emitGroups(groups(), [{ group: 'order-card', axes: { status: ['late'] }, states: [], part: null, dynamic: false, accent: { radius: 'round' } }], { dev: true })
    expect(css).toContain(':scope[data-accent~="radius:round"] {\n      border-radius: var(--warp-radius-round);')
    expect(css.indexOf('data-accent')).toBeGreaterThan(css.indexOf('data-status="late"'))
  })

  test('unused groups emit nothing', () => {
    expect(emitGroups(groups(), [])).toBe('')
  })

  test('raw values and unknown intents are errors that name them', () => {
    expect(() => resolve({ pad: '13px' }, 'group x base')).toThrow(new GroupError('group x base: `pad: "13px"` isn\'t a token (pad is one of none, hair, tight, related, group, section, page, control, surface)'))
    expect(() => resolve({ padding: 'group' }, 'group x base')).toThrow(/`padding` isn't an intent/)
    expect(resolve({ pad: 'group', css: { gridTemplateColumns: '1fr auto' } }, '')).toEqual({ padding: 'var(--warp-space-group)', 'grid-template-columns': '1fr auto' })
  })
})

test('every token the vocabulary names exists in warp.css', async () => {
  const { readFileSync } = await import('node:fs')
  const { VOCAB } = await import('../src/style/vocab')
  const warp = readFileSync(`${process.cwd()}/../../docs/design/warp/tokens/warp.css`, 'utf8')
  const defined = new Set([...warp.matchAll(/(--warp-[\w-]+)\s*:/g)].map(m => m[1]))
  const used = new Set(Object.values(VOCAB).flatMap(vs => Object.values(vs).flatMap(d => Object.values(d as Record<string, string>).flatMap(v => [...v.matchAll(/var\((--warp-[\w-]+)/g)].map(m => m[1])))))
  expect([...used].filter(v => !defined.has(v))).toEqual([])
})

describe('runtime: a reactive axis is one attribute write', () => {
  test('status change: 1 DOM mutation, the data-status attribute', async () => {
    const status = state<'open' | 'late' | 'done'>('open')
    render(() => <span {...badge({ status: status.value })}>Order <i {...badge.icon}>!</i></span>)
    const el = screen.getByText(/Order/)
    expect(el.getAttribute('data-g')).toBe('badge')
    expect(el.getAttribute('data-status')).toBe('open')
    await expect(() => { status.value = 'late' }).toTouchAtMost(1, { runs: 1 })
    expect(el.getAttribute('data-status')).toBe('late')
    const t = await touches(() => { status.value = 'done' })
    expect([t.mutations, t.attributes]).toEqual([1, 1])
  })

  test('a site the compiler can\'t lower still works through group() at runtime', async () => {
    const axes = state<{ status: 'open' | 'late' }>({ status: 'late' })
    render(() => <span {...badge(axes.value)}>x</span>)
    expect(screen.getByText('x').getAttribute('data-status')).toBe('late')
    axes.value = { status: 'open' }
    await flush()
    expect(screen.getByText('x').getAttribute('data-status')).toBe('open')
  })
})

describe('SSR → hydrate, the groups shop', () => {
  const products: Product[] = [
    { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
    { id: 'banana', name: 'Banana', category: 'fruit', price: 0.25, stock: 3 },
    { id: 'yogurt', name: 'Yogurt', category: 'dairy', price: 0.9, stock: 0 },
  ]
  const data = () => ({
    products,
    cart: { apple: { qty: 2, addedPrice: 0.4 }, banana: { qty: 1, addedPrice: 0.25 } },
    filters: { search: '', category: 'all' as const, sort: 'name' as const },
  })

  test('the server writes the group attributes; hydration claims them with 0 writes and 0 misses', () => {
    const html = renderToString(() => ServerShop(data()))
    expect(html).toContain('data-g="product-row" data-stock="low"')
    expect(html).toContain('data-g="product-row" data-stock="out"')
    expect(html).toContain('data-g="cart-line" data-trend="up"')
    expect(html).toContain('data-g="tab" aria-pressed="true"')
    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = html
    const before = [...container.querySelectorAll('*')]
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver(r => mutations.push(...r))
    observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true })
    hydrate(() => ClientShop(data()), container)
    mutations.push(...observer.takeRecords())
    observer.disconnect()
    expect(hydration.misses).toBe(0)
    expect(mutations).toHaveLength(0)
    expect(before.every(el => el.isConnected)).toBe(true)
  })

  test('after hydration, an axis change is one attribute write', async () => {
    const html = renderToString(() => ServerShop(data()))
    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = html
    hydrate(() => ClientShop(data()), container)
    const add = screen.getByRole('button', { name: 'Add Apple' }) // apple: 20 in stock, 2 in the cart → "in"
    const row = add.closest('li')!
    expect(row.getAttribute('data-stock')).toBe('in')
    const t = await touches(async () => { for (let i = 0; i < 15; i++) add.click(); await flush() })
    expect(row.getAttribute('data-stock')).toBe('low')
    const records: MutationRecord[] = []
    const observer = new MutationObserver(r => records.push(...r))
    observer.observe(container, { subtree: true, attributes: true })
    add.click()
    await flush()
    observer.disconnect()
    expect(records.filter(r => r.attributeName === 'data-stock')).toHaveLength(0) // low → low: no write
    expect(t.attributes).toBeGreaterThanOrEqual(1)
  })
})
