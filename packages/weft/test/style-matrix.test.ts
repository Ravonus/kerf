// The style matrix (research 23 §2.4, src/style/matrix.ts): .weft/styles.json from definitions and call sites, the
// project-wide D-codes, `explainGroup`, the project scan the CLI uses, and the Vite build writing the file.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import weft from '../vite.mjs'
import { group } from '../src/style'
import { buildMatrix, explainGroup, scanProject } from '../src/style/matrix'
import type { GroupSource, GroupUse } from '../src/style/css'

const { transform } = require('../compiler.cjs')

const card: GroupSource = {
  name: 'order-card', file: 'src/card.tsx', line: 3, binding: 'card', exported: true, doc: 'A card for one order.',
  def: {
    base: { surface: 'raised', pad: 'group', emphasis: 'subtle' },
    axes: { status: { open: { tone: 'info' }, late: { tone: 'critical' } }, density: 'inherit' },
    parts: { title: { text: 'title' } },
    states: { selected: { ring: 'accent' } },
    defaults: { status: 'open' },
  },
}
const site = (u: Partial<GroupUse>): GroupUse => ({ group: 'order-card', axes: {}, states: [], part: null, dynamic: false, file: 'src/list.tsx', line: 1, ...u })

describe('buildMatrix', () => {
  test('one entry per group: axes, parts, states, resolved CSS, tokens, uses, accents, bytes', () => {
    const m = buildMatrix([card], [site({ axes: { status: null }, states: ['selected'], line: 7 }), site({ part: 'title', line: 8 }), site({ axes: { status: ['late'] }, accent: { radius: 'round' }, line: 9 })])
    const g = m.groups['order-card']
    expect(g).toMatchObject({
      doc: 'A card for one order.', file: 'src/card.tsx:3', binding: 'card', exported: true,
      axes: { status: ['open', 'late'], density: 'inherit' }, defaults: { status: 'open' }, parts: ['title'], states: ['selected'], compounds: [],
      used: [
        { file: 'src/list.tsx', line: 7, axes: { status: 'dynamic' }, states: ['selected'] },
        { file: 'src/list.tsx', line: 8, axes: {}, states: [], part: 'title' },
        { file: 'src/list.tsx', line: 9, axes: { status: ['late'] }, states: [] },
      ],
      accents: [{ file: 'src/list.tsx', line: 9, set: { radius: 'round' } }],
      escapes: [], contextTone: false,
    })
    expect(g.resolved.base).toEqual({ 'background-color': 'var(--warp-color-surface-raised)', padding: 'var(--warp-space-group)', color: 'var(--_text, var(--warp-color-text-subtle))' })
    expect(g.resolved['status=late']['--_text']).toBe('var(--warp-color-critical-text)')
    expect(g.tokens).toEqual(['emphasis.subtle', 'pad.group', 'radius.round', 'ring.accent', 'surface.raised', 'text.title', 'tone.critical', 'tone.info'])
    expect(g.bytes).toBeGreaterThan(300)
    expect(m.vocab.pad).toContain('group')
    expect(m.diagnostics).toEqual([])
  })

  test('contextTone: a group that reads a tone without setting one', () => {
    const badge: GroupSource = { name: 'chip', file: 'c.tsx', line: 1, def: { base: { emphasis: 'soft' } } }
    expect(buildMatrix([badge], []).groups.chip.contextTone).toBe(true)
  })

  test('D021 similar groups, D022 repeated accents, D023 escapes, D024 overlapping compounds, D025 unknown tokens', () => {
    const twin = { ...card, name: 'invoice-card', line: 20 }
    const raw: GroupSource = { name: 'grid', file: 'g.tsx', line: 1, def: { base: { layout: 'grid', css: { gridTemplateColumns: '1fr auto', padding: 'var(--warp-space-group)' } } } }
    const clash: GroupSource = {
      name: 'row', file: 'r.tsx', line: 1,
      def: { axes: { size: { s: {}, l: {} }, tone: { a: {}, b: {} } }, compounds: [{ when: { size: 'l' }, set: { pad: 'group' } }, { when: { tone: 'b' }, set: { pad: 'tight' } }, { when: { size: 's', tone: 'a' }, set: { pad: 'hair' } }] },
    }
    const typo: GroupSource = { name: 'typo', file: 't.tsx', line: 1, def: { base: { pad: 'grup' } } }
    const accent = { radius: 'round' as const }
    const m = buildMatrix([card, twin, raw, clash, typo], [1, 2, 3].map(line => site({ accent, line })))
    expect(m.similar).toEqual([['invoice-card', 'order-card', 1]])
    expect(m.diagnostics.map(d => `${d.code} ${d.file}:${d.line} ${d.message}`)).toEqual([
      'D023 g.tsx:1 group grid base uses the `css` escape for gridTemplateColumns, padding',
      // only compounds 0 and 1 can match together; 2 needs size=s, which excludes 0
      'D024 r.tsx:1 compounds 0 and 1 of row can both match ({"size":"l","tone":"b"}) and set padding differently; compound 1 wins only by order',
      'D021 src/card.tsx:3 groups invoice-card (src/card.tsx:20) and order-card resolve to 100% the same CSS',
      "D022 src/list.tsx:1 the accent { radius: 'round' } on order-card appears 3 times (src/list.tsx:1, src/list.tsx:2, src/list.tsx:3)",
      'D025 t.tsx:1 group typo (t.tsx:1) base: `pad: "grup"` isn\'t a token (Did you mean `group`? pad is one of none, hair, tight, related, group, section, page, control, surface)',
    ])
    // D023 names the token when one sets the same value
    expect(m.diagnostics[0].help).toContain("padding: pad: 'group' is the same value")
  })

  test('D024: an accent against the site\'s own axis value', () => {
    const m = buildMatrix([card], [site({ axes: { status: ['late'] }, accent: { tone: 'caution' } })])
    expect(m.diagnostics.map(d => d.message)).toEqual(['the accent {"tone":"caution"} on order-card sets the tone, which its status=late also sets'])
  })
})

describe('explainGroup', () => {
  test('cascade order with sources and overrides; defaults fill the axes', () => {
    const e = explainGroup(card, { states: ['selected'], accent: { pad: 'tight' } })
    expect(e.selection).toEqual({ axes: { status: 'open' }, states: ['selected'], accent: { pad: 'tight' } })
    const root = e.elements[0]
    expect(root.element).toBe('root')
    expect(root.decls.filter(d => d.prop === 'padding')).toEqual([
      { prop: 'padding', value: 'var(--warp-space-group)', from: 'pad: group', at: 'base', overridden: true },
      { prop: 'padding', value: 'var(--warp-space-tight)', from: 'pad: tight', at: 'accent pad:tight' },
    ])
    expect(e.elements.map(x => x.element)).toEqual(['root', 'part title'])
    expect(e.css).toContain(':scope[data-accent~="pad:tight"]')
    expect(e.css).toContain('color: var(--warp-color-info-text)') // the tone, folded for this selection
  })

  test('unknown names throw with the closest', () => {
    expect(() => explainGroup(card, { axes: { status: 'lat' } })).toThrow("`lat` isn't a value of order-card's `status` axis (Did you mean `late`? values: open, late)")
    expect(() => explainGroup(card, { part: 'titel' })).toThrow(/Did you mean `title`\?/)
    expect(() => explainGroup(card, { axes: { density: 'compact' } })).toThrow(/has no axis `density`/)
  })
})

describe('the project scan and the Vite build', () => {
  const files = {
    'src/card.tsx': "import { group } from '@weft-js/core/style'\n/** A card. */\nexport const card = group('card', { base: { pad: 'group' }, axes: { tone: { a: { tone: 'info' }, b: { tone: 'critical' } } }, parts: { title: { text: 'title' } } })\n",
    'src/main.tsx': "import { card } from './card'\nexport const A = (p: { b: boolean }) => <div {...card({ tone: p.b ? 'b' : 'a' })}><h3 {...card.title}>x</h3></div>\n",
  }
  const tmp = () => {
    const root = mkdtempSync(join(tmpdir(), 'weft-matrix-'))
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(join(root, f, '..'), { recursive: true })
      writeFileSync(join(root, f), text)
    }
    return root
  }

  test('scanProject follows relative imports to find each site\'s groups', () => {
    const root = tmp()
    try {
      const s = scanProject(root, Object.keys(files), transform)
      expect(s.groups.map(g => [g.name, g.file, g.doc])).toEqual([['card', 'src/card.tsx', 'A card.']])
      expect(s.uses.map(u => [u.file, u.line, u.part ?? u.axes.tone])).toEqual([['src/main.tsx', 2, ['b', 'a']], ['src/main.tsx', 2, 'title']])
      expect(s.diagnostics).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a build writes .weft/styles.json', async () => {
    const root = tmp()
    const vitest = process.env.VITEST
    delete process.env.VITEST // the plugin skips its project scan under vitest
    try {
      await build({ root, logLevel: 'silent', plugins: [weft({ style: { matrix: true } })], build: { write: false, lib: { entry: join(root, 'src/main.tsx'), formats: ['es'] }, rollupOptions: { external: [/^@weft-js/core/] } } })
      expect(existsSync(join(root, '.weft/styles.json'))).toBe(true)
      const m = JSON.parse(readFileSync(join(root, '.weft/styles.json'), 'utf8'))
      expect(m.groups.card).toMatchObject({ file: 'src/card.tsx:3', doc: 'A card.', axes: { tone: ['a', 'b'] }, used: [{ file: 'src/main.tsx', line: 2, axes: { tone: ['b', 'a'] } }, { part: 'title' }] })
    } finally {
      process.env.VITEST = vitest
      rmSync(root, { recursive: true, force: true })
    }
  })
})

test('runtime group(): an accent is the same data-accent the compiler writes', () => {
  const g = group('x', { axes: { s: { a: {} } } })
  expect(g({ s: 'a', accent: { radius: 'round', pad: 'tight' } })).toEqual({ 'data-g': 'x', 'data-s': 'a', 'data-accent': 'pad:tight radius:round' })
})
