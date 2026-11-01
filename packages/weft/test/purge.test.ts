// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, purge, reachable, unnest, words } from '../node/purge.mjs'

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
  const out: any = await build({ root, base: './', configFile: false, logLevel: 'silent', plugins: [weft()], build: { write: false, cssCodeSplit: true } })
  const files = (Array.isArray(out) ? out : [out]).flatMap((o: any) => o.output)
  const sheets = files.filter((f: any) => f.fileName.endsWith('.css')).map((f: any) => f.fileName.split('/').pop())
  const named = files.filter((f: any) => f.type === 'chunk').flatMap((f: any) => [...f.code.matchAll(/[\w-]+\.css/g)].map(m => m[0]))
  expect(named.length).toBeGreaterThan(0)
  for (const name of named) expect(sheets).toContain(name)
  rmSync(root, { recursive: true, force: true })
}, 30000)
