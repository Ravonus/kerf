import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ranges } from '../src/agents-md.mjs'
import { check } from '../src/check.mjs'
import { handle } from '../src/mcp.mjs'
import { classSoup, findGroups, parseTarget, styleMatrix } from '../src/style.mjs'
import { bin, project } from './helpers.mjs'

const weft = (...args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

const cards = `import { group } from '@weft-js/core/style'

/** A summary card for one order in a list. */
export const orderCard = group('order-card', {
  base: { surface: 'raised', pad: 'group', radius: 'surface', layout: 'stack', gap: 'related' },
  axes: { status: { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } } },
  parts: { title: { text: 'title' }, meta: { text: 'caption', emphasis: 'subtle' } },
  states: { selected: { ring: 'accent' } },
  compounds: [{ when: { status: 'late' }, part: 'meta', set: { text: 'label' } }],
  defaults: { status: 'open' },
})

/** A small status label next to a title. */
export const statusBadge = group('status-badge', {
  base: { layout: 'inline', padInline: 'related', radius: 'round', text: 'caption', emphasis: 'soft' },
  axes: { level: { info: { tone: 'info' }, bad: { tone: 'critical' } } },
  defaults: { level: 'info' },
})
`

const orders = `import { state } from '@weft-js/core'
import { orderCard, statusBadge } from './cards'

export function Orders(props: { orders: { id: string; name: string; status: 'open' | 'shipped' | 'late' }[] }) {
  const picked = state<string | null>(null)
  return (
    <ul>
      {props.orders.map(o => (
        <li key={o.id} {...orderCard({ status: o.status, selected: picked.value === o.id })}>
          <h3 {...orderCard.title}>{o.name}</h3>
          <span {...statusBadge({ level: o.status === 'late' ? 'bad' : 'info' })}>{o.status}</span>
        </li>
      ))}
    </ul>
  )
}
`

/** A clean project: two groups, one consumer. */
const clean = () => project({ 'src/cards.tsx': cards, 'src/orders.tsx': orders })

describe('weft style find', () => {
  it('finds the group that fits by name, doc, part or token, best first', async () => {
    const { matrix } = await styleMatrix(clean())
    const card = findGroups(matrix, 'card')
    expect(card.groups.map((g) => g.name)).toEqual(['order-card'])
    expect(card.groups[0]).toMatchObject({
      doc: 'A summary card for one order in a list.',
      file: 'src/cards.tsx:4',
      import: { name: 'orderCard', from: 'src/cards.tsx' },
      axes: { status: ['open', 'shipped', 'late'] },
      parts: ['title', 'meta'],
      states: ['selected'],
      uses: 2,
    })
    expect(findGroups(matrix, 'status label').groups[0].name).toBe('status-badge') // doc words
    expect(findGroups(matrix, 'critical').groups.map((g) => g.name)).toEqual([
      'order-card',
      'status-badge',
    ]) // a token both use
    expect(findGroups(matrix, 'ordr card').groups[0].name).toBe('order-card') // one typo in a name word
    expect(findGroups(matrix, 'zebra')).toMatchObject({ groups: [], total: 2 })
  })

  it('from the bin: JSON with --json, a list for humans otherwise', () => {
    const dir = clean()
    const r = weft('style', 'find', 'order', '--json', '--root', dir)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout).groups[0].name).toBe('order-card')
    expect(weft('style', 'find', 'badge', '--root', dir).stderr).toMatch(
      /^status-badge\s+src\/cards\.tsx:14\n {4}A small status label next to a title\.\n {4}level: info\|bad · 1 uses$/m,
    )
  })
})

function registerStyleResolution() {
  it('resolves one variation, root and parts, with where each value came from', () => {
    const r = weft(
      'style',
      'explain',
      'order-card',
      '--status',
      'late',
      '--states',
      'selected',
      '--json',
      '--root',
      clean(),
    )
    expect(r.code).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.selection).toEqual({ axes: { status: 'late' }, states: ['selected'], accent: {} })
    expect(out.attributes.root).toBe('data-g="order-card" data-status="late" aria-selected="true"')
    const root = out.elements.find((e) => e.element === 'root').decls
    expect(root).toContainEqual({
      prop: 'padding',
      value: 'var(--warp-space-group)',
      from: 'pad: group',
      at: 'base',
    })
    expect(root).toContainEqual({
      prop: '--_text',
      value: 'var(--warp-color-critical-text)',
      from: 'tone: critical',
      at: 'status=late',
    })
    expect(root).toContainEqual({
      prop: 'box-shadow',
      value: expect.stringContaining('accent-solid'),
      from: 'ring: accent',
      at: 'state selected',
    })
    // the compound wins over the part's own text size, and says so
    const meta = out.elements.find((e) => e.element === 'part meta').decls
    expect(meta.find((d) => d.prop === 'font-size' && d.at === 'part meta')).toMatchObject({
      overridden: true,
    })
    expect(meta.find((d) => d.prop === 'font-size' && d.at === 'compound 0')).toMatchObject({
      value: 'var(--warp-text-label-size)',
      from: 'text: label',
    })
    expect(out.css).toContain('@scope ([data-g="order-card"]) to ([data-g])')
    expect(out.css).toContain(':scope[data-status="late"] [data-part="meta"]')
    // the meta part reads the root's tone, so the channel stays (a tone only folds where it's set and read on one element)
    expect(out.css).toContain(
      ':scope[data-status="late"] {\n      --_text: var(--warp-color-critical-text);',
    )
    expect(out.sites).toEqual([
      { file: 'src/orders.tsx', line: 9, axes: { status: 'dynamic' }, states: ['selected'] },
    ])
  })

  it('takes a DOM selector, as copied from devtools, and prints it for humans', () => {
    const dir = clean()
    const r = weft('style', 'explain', '[data-g="status-badge"][data-level="bad"]', '--root', dir)
    expect(r.code).toBe(0)
    expect(r.stderr).toMatch(
      /^status-badge {2}src\/cards\.tsx:14 {2}— A small status label next to a title\.$/m,
    )
    expect(r.stderr).toMatch(
      /^ {6}--_soft: var\(--warp-color-critical-soft\) +← tone: critical \(level=bad\)$/m,
    )
    expect(r.stderr).toContain('background-color: var(--warp-color-critical-soft)')
  })
}

function registerStyleTargets() {
  it('unknown names are D025 with the closest ones', () => {
    const dir = clean()
    const r = weft('style', 'explain', 'order-crd', '--json', '--root', dir)
    expect(r.code).toBe(2)
    expect(JSON.parse(r.stdout).error).toEqual({
      code: 'E_UNKNOWN_GROUP',
      message: expect.stringMatching(/^D025 no group `order-crd`; did you mean `order-card`\?/),
    })
    expect(
      JSON.parse(weft('style', 'explain', 'order-card[status=lat]', '--json', '--root', dir).stdout)
        .error.message,
    ).toBe(
      "D025 `lat` isn't a value of order-card's `status` axis (Did you mean `late`? values: open, shipped, late)",
    )
  })

  it('reads every target form', () => {
    expect(parseTarget('order-card')).toEqual({
      group: 'order-card',
      part: null,
      axes: {},
      states: [],
      accent: {},
    })
    expect(parseTarget('order-card.title')).toMatchObject({ group: 'order-card', part: 'title' })
    expect(parseTarget('order-card[status=late][selected]')).toMatchObject({
      axes: { status: 'late' },
      states: ['selected'],
    })
    expect(
      parseTarget(
        '[data-g="order-card"][data-status="late"][aria-selected="true"][data-accent~="radius:round"] [data-part="meta"]',
      ),
    ).toEqual({
      group: 'order-card',
      part: 'meta',
      axes: { status: 'late' },
      states: ['selected'],
      accent: { radius: 'round' },
    })
    expect(() => parseTarget('')).toThrow(/explain <group\|selector>/)
  })
}

describe('weft style explain', () => {
  registerStyleResolution()
  registerStyleTargets()
})

function registerCleanStyleCheck() {
  it('a clean project gets no style codes, and the matrix is written', async () => {
    const dir = clean()
    const r = await check(dir)
    expect(r.diagnostics.filter((d) => d.code.startsWith('D0'))).toEqual([])
    expect(r.styles).toEqual({ groups: 2, matrix: '.weft/styles.json' })
    const m = JSON.parse(readFileSync(join(dir, '.weft/styles.json'), 'utf8'))
    expect(Object.keys(m.groups)).toEqual(['order-card', 'status-badge'])
    expect(m.groups['order-card']).toMatchObject({
      file: 'src/cards.tsx:4',
      defaults: { status: 'open' },
      compounds: [{ when: { status: 'late' }, part: 'meta' }],
      used: [
        { file: 'src/orders.tsx', line: 9, axes: { status: 'dynamic' }, states: ['selected'] },
        { file: 'src/orders.tsx', line: 10, part: 'title', axes: {}, states: [] },
      ],
      tokens: expect.arrayContaining(['pad.group', 'tone.critical', 'ring.accent']),
      contextTone: false,
    })
    expect(m.groups['status-badge'].used[0].axes).toEqual({ level: ['bad', 'info'] })
    expect(m.groups['order-card'].bytes).toBeGreaterThan(200)
    expect(m.vocab.tone).toContain('critical')
    expect(m.diagnostics).toEqual([])
  })
}

function registerStyleDiagnostics() {
  it('reports D020–D025 where they are', async () => {
    const dir = project({
      'src/cards.tsx': (
        cards.replace(
          "radius: 'round', text: 'caption'",
          "radius: 'round', text: 'caption', css: { letterSpacing: '0.02em' }",
        ) +
        // D021: the same CSS under another name
        "\nexport const invoiceCard = group('invoice-card', " +
        cards
          .slice(cards.indexOf('{\n  base: { surface'), cards.indexOf('\n/** A small'))
          .trimEnd() +
        '\n'
      )
        // D024 (b): two compounds that both match status=late and set the meta's text differently (in both cards)
        .replaceAll(
          "compounds: [{ when: { status: 'late' }, part: 'meta', set: { text: 'label' } }]",
          "compounds: [{ when: { status: 'late' }, part: 'meta', set: { text: 'label' } }, { when: { status: 'late' }, part: 'meta', set: { text: 'title' } }]",
        ),
      'src/orders.tsx': orders,
      'src/home.tsx': `import { orderCard, statusBadge } from './cards'
export const A = () => <article {...orderCard({ status: 'late', accent: { radius: 'round' } })} />
export const B = () => <article {...orderCard({ accent: { radius: 'round' } })} />
export const C = () => <article {...orderCard({ status: 'shipped', accent: { radius: 'round' } })} />
export const D = () => <article {...orderCard({ status: 'late', accent: { tone: 'caution' } })} />
export const E = () => <article {...orderCard({ status: 'Late' })} />
export const F = () => <article {...orderCard({ accent: { radius: 'roundish' } })} />
export const G = () => <p {...orderCard()} {...statusBadge()} />
`,
      'src/soup.tsx': `export function PromoBanner() {
  return (
    <div>
      <section class="flex flex-col gap-4 p-6 rounded-xl bg-white shadow-md border border-gray-200">x</section>
      <p className="text-sm text-gray-500 font-medium leading-6">a</p>
      <p className={'leading-6 text-sm font-medium text-gray-500'}>b</p>
    </div>
  )
}
`,
    })
    const r = await check(dir)
    const style = r.diagnostics
      .filter((d) => d.code.startsWith('D0'))
      .map((d) => `${d.file}:${d.span[0]} ${d.code} ${d.severity} ${d.why}`)
    expect(style).toEqual([
      // D021 is reported on the later group by name, naming the other; D024 (b) on each definition
      'src/cards.tsx:4 D021 warning groups invoice-card (src/cards.tsx:20) and order-card resolve to 100% the same CSS',
      'src/cards.tsx:4 D024 error compounds 0 and 1 of order-card can both match ({"status":"late"}) and set font-size, line-height, font-weight differently; compound 1 wins only by order',
      'src/cards.tsx:14 D023 warning group status-badge base uses the `css` escape for letterSpacing',
      'src/cards.tsx:20 D024 error compounds 0 and 1 of invoice-card can both match ({"status":"late"}) and set font-size, line-height, font-weight differently; compound 1 wins only by order',
      "src/home.tsx:2 D022 info the accent { radius: 'round' } on order-card appears 3 times (src/home.tsx:2, src/home.tsx:3, src/home.tsx:4)",
      'src/home.tsx:5 D024 error the accent {"tone":"caution"} on order-card sets the tone, which its status=late also sets',
      "src/home.tsx:6 D025 error `Late` isn't a value of order-card's `status` axis",
      'src/home.tsx:7 D025 error accent `radius: "roundish"` on order-card isn\'t a token',
      'src/home.tsx:8 D024 error two group roots on one element: order-card and status-badge (the last `data-g` would win)',
      "src/soup.tsx:4 D020 warning <section> carries 9 classes: nobody can read what it is or which variation it's in.",
      'src/soup.tsx:6 D020 warning The same 4 classes are written in 2 places (first at src/soup.tsx:5): one look, copied by hand.',
    ])
    const byCode = Object.fromEntries(r.diagnostics.map((d) => [d.code, d]))
    expect(r.diagnostics.filter((d) => d.code === 'D025').map((d) => d.fix.text)).toEqual([
      'Did you mean `late`? Values of order-card.status: open, shipped, late.',
      'Did you mean `round`? radius is one of none, mark, control, surface, round.',
    ])
    // the name comes from the component, then the element for a second one in it
    expect(
      r.diagnostics
        .filter((d) => d.code === 'D020')
        .map((d) => d.fix.text.match(/group\('([\w-]+)'/)[1]),
    ).toEqual(['promo-banner', 'promo-banner-p'])
    expect(byCode.D023.fix.text).toBe(
      'No intent sets these properties; keep the escape, or propose an intent for the vocabulary.',
    )
    expect(r.ok).toBe(false)
    expect(existsSync(join(dir, '.weft/styles.json'))).toBe(true)
  })
}

describe('weft check: the style D-codes and .weft/styles.json', () => {
  registerCleanStyleCheck()
  registerStyleDiagnostics()
})

describe('MCP style tools', () => {
  it('style_find and style_explain return the CLI JSON', async () => {
    const dir = clean()
    const call = (name, args) =>
      handle(dir, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    const found = await call('style_find', { query: 'card' })
    expect(found.result.isError).toBe(false)
    expect(found.result.structuredContent.groups[0].name).toBe('order-card')
    const explained = await call('style_explain', {
      target: 'order-card.title',
      axes: { status: 'shipped' },
    })
    expect(explained.result.structuredContent).toMatchObject({
      group: 'order-card',
      selection: { axes: { status: 'shipped' } },
      attributes: { part: 'data-part="title"' },
    })
    expect(explained.result.structuredContent.elements.map((e) => e.element)).toEqual([
      'root',
      'part title',
    ])
    const bad = await call('style_explain', { target: 'order-card', axes: { size: 'big' } })
    expect(bad.result).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('D025 group order-card has no axis `size`') }],
    })
  })
})

describe('helpers', () => {
  it('classSoup leaves short and unique class lists alone', () => {
    expect(
      classSoup([{ rel: 'a.tsx', text: 'export const A = () => <p class="row gap">x</p>' }]),
    ).toEqual([])
  })

  it('ranges collapses runs of three or more', () => {
    expect(ranges(['T001', 'T002', 'T003', 'P007', 'P008', 'W011', 'W012', 'W013', 'W020'])).toBe(
      'T001–T003, P007, P008, W011–W013, W020',
    )
  })
})
