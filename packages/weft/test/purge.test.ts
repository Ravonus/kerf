// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { layerOrder, markup, parse, pieces, purge, reachable, unnest, words } from '../node/purge.mjs'

const has = (...w: string[]) => words([w.join(' ')])
const out = (css: string, ...w: string[]) => purge([css], has(...w))[0]

test('a rule keyed on a value no build file mentions goes; one it mentions stays', () => {
  expect(out('[data-scope=table] a{color:red}[data-scope=knob] a{color:blue}', 'table')).toBe('[data-scope=table] a{color:red}')
})

test('a selector list loses only its dead members', () => {
  expect(out(':where([data-scope="a"],[data-scope="b"]){color:red}', 'b')).toBe(':where([data-scope="b"]){color:red}')
  expect(out('[data-scope="a"],[data-scope="b"]{color:red}', 'b')).toBe('[data-scope="b"]{color:red}')
})

test('dead alternatives go from a :where() or :is() the rule keeps, however deep', () => {
  expect(out('[data-part="x"]:is([data-scope="a"],[data-scope="b"]) p{color:red}', 'b', 'x')).toBe('[data-part="x"]:is([data-scope="b"]) p{color:red}')
  expect(out('p:is(:where([data-scope="a"],[data-scope="b"]) i,[data-scope="a"]){color:red}', 'b')).toBe('p:is(:where([data-scope="b"]) i){color:red}')
})

test('a dial tier the build never names goes, with the tokens only it read, and one it names stays', () => {
  const css = ':root{--warp-a:1;--warp-b:2}[data-expression=vivid]{--warp-b:3}[data-fields=classic] p{color:var(--warp-a)}p{color:var(--warp-b)}'
  expect(out(css)).toBe(':root{--warp-b:2}p{color:var(--warp-b)}')
  expect(out(css, 'vivid')).toBe(':root{--warp-b:2}[data-expression=vivid]{--warp-b:3}p{color:var(--warp-b)}')
})

test(':where lives if any branch does, and :not is no evidence', () => {
  expect(reachable(':where([data-scope="a"],[data-scope="b"]) p', has('b').has)).toBe(true)
  expect(reachable(':where([data-scope="a"],[data-scope="c"]) p', has('b').has)).toBe(false)
  expect(reachable('p:not([data-part="gone"])', has().has)).toBe(true)
})

test('every keyed attribute in a selector has to be reachable', () => {
  expect(out('[data-scope=a] [data-part=b]{color:red}', 'a')).toBe('')
})

test('data-theme and plain selectors are left alone: the OS answers those', () => {
  const css = '[data-theme=dark]{color:red}.x{color:blue}'
  expect(out(css)).toBe(css)
})

test('at-rules empty after pruning go; layer order statements stay', () => {
  expect(out('@layer a,b;@layer a{@media (width>1px){[data-scope=k]{color:red}}}')).toBe('@layer a,b;')
})

test('custom properties go when nothing reads them, including through a chain', () => {
  const css = ':root{--warp-a:1;--warp-b:var(--warp-a);--warp-c:2}p{top:var(--warp-c)}'
  expect(out(css)).toBe(':root{--warp-c:2}p{top:var(--warp-c)}')
})

test('a property the JS reads stays, and so does one not owned by warp', () => {
  expect(out(':root{--warp-a:1;--brand:2}', '--warp-a')).toBe(':root{--warp-a:1;--brand:2}')
})

test('keyframes stay only while something runs them', () => {
  const live = '[data-scope=a]{animation:spin 1s}@keyframes spin{to{top:0}}'
  expect(out(live, 'a')).toBe(live)
  expect(out(live)).toBe('')
})

test('keep and template stems save names built at run time', () => {
  expect(purge(['[data-scope=knob]{color:red}'], words([], ['knob']))[0]).toContain('knob')
  // oxlint-disable-next-line no-template-curly-in-string -- source text: a template literal is what's being scanned
  expect(purge(['[data-part=icon-tile]{color:red}'], words(['`icon-${x}`']))[0]).toContain('icon-tile')
})

test('a token or keyframes one sheet defines and another uses stays', () => {
  const sheets = [':root{--warp-a:1}@keyframes spin{to{top:0}}', 'p{top:var(--warp-a);animation:spin 1s}']
  expect(purge(sheets, has())).toEqual(sheets)
})

test('braces and semicolons inside strings and url() do not split a rule', () => {
  const css = 'a[title="}{;"]{background:url(data:image/svg+xml;base64,AAA)}'
  expect(parse(css)).toHaveLength(1)
  expect(out(css)).toBe(css)
})

test('unnest moves each compound into its own :where, so a browser can file the rule by its last one', () => {
  expect(unnest(':where([a] [b]>c+d~e)')).toBe(':where([a]) :where([b])>:where(c)+:where(d)~:where(e)')
  expect(unnest(':where(a,b c)')).toBe(':where(a),:where(b) :where(c)')
})

test('unnest keeps pseudo-elements, brackets and anything else it does not understand', () => {
  expect(unnest(':where(a b)::before')).toBe(':where(a) :where(b)::before')
  expect(unnest(':where([t="x y"]:not(a b) c)')).toBe(':where([t="x y"]:not(a b)) :where(c)')
  expect(unnest(':where(a b):hover')).toBe(':where(a) :where(b):hover')
  expect(unnest(':where(a,b):has(c) d')).toBe(':where(a):has(c) d,:where(b):has(c) d')
  expect(unnest('a b')).toBe('a b')
})

test("with `base: './'`, a lazy chunk's preload list names the purged stylesheet, not the one it replaced", async () => {
  const { build } = await import('vite')
  const { default: weft } = await import('../vite.mjs')
  const root = mkdtempSync(join(tmpdir(), 'weft-purge-'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><script type="module" src="/main.js"></script>')
  writeFileSync(join(root, 'main.js'), `import './main.css'\nimport('./lazy.js')\n`)
  writeFileSync(join(root, 'lazy.js'), `import './lazy.css'\nexport const lazy = 'used'\n`)
  writeFileSync(join(root, 'main.css'), '.used{color:red}.gone-rule{color:blue}')
  writeFileSync(join(root, 'lazy.css'), '.used{color:green}')
  const built = await build({ root, base: './', configFile: false, logLevel: 'silent', plugins: [weft()], build: { write: false, cssCodeSplit: true } })
  const files = ([built].flat() as unknown as { output: { fileName: string; type: string; code: string }[] }[]).flatMap(o => o.output)
  const sheets = files.filter(f => f.fileName.endsWith('.css')).map(f => f.fileName.split('/').pop())
  const named = files.filter(f => f.type === 'chunk').flatMap(f => [...f.code.matchAll(/[\w-]+\.css/g)].map(m => m[0]))
  expect(named.length).toBeGreaterThan(0)
  for (const name of named) expect(sheets).toContain(name)
  rmSync(root, { recursive: true, force: true })
}, 30000)

describe('pieces', () => {
  const css = `@layer warp.tokens,warp.base;@layer warp.tokens{:root{--warp-a:1px;--warp-b:var(--warp-c);--warp-c:2px;--warp-unused:3px}}@layer warp.base{[data-scope=knob]{width:var(--warp-b);animation:spin 1s}[data-scope=knob]:hover{color:red}[data-scope=dial]{height:1px}[data-theme=dark] b{color:blue}p{margin:0}}@keyframes spin{to{rotate:1turn}}@media print{p{color:#000}}`
  const lookup = (html: string) => {
    const t = pieces([['a', css]])
    const present = markup(html), ids = new Set<number>(), take = (i: number) => { if (!ids.has(i)) { ids.add(i); t.deps[i]!.forEach(take) } }
    t.always.forEach(take)
    for (const word of present) (t.index as Record<string, number[]>)[word]?.forEach((i: number) => { const n = t.alts[i]; if (!n || n.some(([all]: string[][]) => all!.every((k: string) => present.has(k)))) take(i) })
    return [...ids].map(i => t.pieces[i][2] + '{' + t.pieces[i][3]).join('\n')
  }

  test('a rendered component brings its rules, the tokens they read through others, and their keyframes', () => {
    const got = lookup('<div data-scope="knob"></div>')
    expect(got).toContain('[data-scope=knob]{width')
    expect(got).toContain('--warp-b:')
    expect(got).toContain('--warp-c:2px')
    expect(got).toContain('@keyframes spin')
    expect(got).not.toContain('--warp-unused')
    expect(got).not.toContain('[data-scope=dial]')
  })

  test('hover states and print wait for the sheet; a theme on the root stays, since no HTML shows it', () => {
    const got = lookup('<div data-scope="knob"><b>x</b><p>y</p></div>')
    expect(got).not.toContain(':hover')
    expect(got).not.toContain('#000')
    expect(got).toContain('[data-theme=dark] b')
  })

  test('a rule needs every word of its selector, not just the rarest', () => {
    const t = pieces([['a', '[data-scope=k][data-x=y]{color:red}']])
    const id = (Object.values(t.index)[0]! as number[])[0]!
    expect(t.alts[id][0][0].sort()).toEqual(['[data-scope=k]', '[data-x=y]'])
  })

  test('layer order is the whole sheet\'s, whatever a page uses', () => {
    expect(layerOrder(css)).toEqual(['warp.tokens', 'warp.base'])
    expect(pieces([['a', css]]).layers).toBe('@layer warp.tokens,warp.base;')
  })

  test('`keep` holds a selector whatever the HTML has', () => {
    expect(pieces([['a', '.late{color:red}']], ['late']).always.length).toBe(1)
    expect(pieces([['a', '.late{color:red}']]).always.length).toBe(0)
  })
})
