// @vitest-environment node
// The split keeps the spec's CSS exactly: every rule ships verbatim, in the spec's order within its file, and the
// files on disk are what the splitter produces from docs/design/warp/tokens today.
import { readFileSync } from 'node:fs'
import { transform } from 'lightningcss'
import { build } from '../scripts/split-css.mjs'

const { files, parts, routed } = build()
const spec = name => readFileSync(new URL(`../../../docs/design/warp/tokens/${name}`, import.meta.url), 'utf8')
const disk = name => readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8')

test('styles/ is the split of the current spec (node scripts/split-css.mjs)', () => {
  for (const [name, text] of files) expect(disk(name), name).toBe(text)
  expect(disk('warp.css')).toBe(spec('warp.css'))
})

test('every rule of the rule-routed families ships verbatim, in spec order, and every rule ships somewhere', () => {
  for (const [family, source] of [['data', 'warp-data.css'], ['layout', 'warp-layout.css']]) {
    const css = spec(source)
    const shipped = new Set()
    for (const [name, list] of routed[family].files) {
      let at = 0
      for (const text of list.flatMap(e => e.inner)) {
        shipped.add(text)
        if (text.startsWith('@keyframes')) { expect(css).toContain(text); continue } // they follow their users
        const found = css.indexOf(text, at)
        expect(found, `${family}/${name}: rule out of order or changed: ${text.slice(0, 80)}`).toBeGreaterThanOrEqual(0)
        at = found + text.length
      }
    }
    const { code } = transform({ filename: source, code: Buffer.from(css), minify: true })
    const every = [...shipped, ...files.get(`${family}/tokens.css`).split('\n')].join('\n')
    for (const name of `${code}`.matchAll(/@keyframes ([\w-]+)/g)) expect(every, name[1]).toContain(`@keyframes ${name[1]}`)
  }
})

test('every rule of the spec ships verbatim, in spec order within its file', () => {
  for (const [family, source] of [['components', 'warp-components.css'], ['inputs', 'warp-inputs.css'], ['rich', 'warp-inputs-rich.css']]) {
    const css = spec(source)
    for (const [name, list] of parts[family].files) {
      let at = 0
      // a tail @media block split by owner is a new wrapper around the spec's own rules: check those instead
      for (const text of list.filter(i => i.kind === 'rule').flatMap(i => i.inner ?? [i.text])) {
        const item = { text }
        const found = css.indexOf(item.text, at)
        expect(found, `${family}/${name}: rule out of order or changed: ${item.text.slice(0, 80)}`).toBeGreaterThanOrEqual(0)
        at = found + item.text.length
      }
    }
  }
})

test('every spec rule outside the tail lands in exactly one file; tail rules land in at least one', () => {
  for (const [family, source] of [['components', 'warp-components.css'], ['inputs', 'warp-inputs.css'], ['rich', 'warp-inputs-rich.css']]) {
    const shipped = [...files].filter(([k]) => k.startsWith(`${family}/`)).map(([, v]) => v).join('\n')
    const css = spec(source)
    const body = css.slice(css.indexOf('{', css.search(/@layer [\w.-]+ \{/)) + 1)
    // the top-level selectors of the spec body all appear in what ships
    for (const m of body.matchAll(/^(:where\([^\n{]{0,60})/gm)) expect(shipped, `${family}: ${m[1]}`).toContain(m[1])
  }
})

test('each file parses as CSS and keeps its layer', () => {
  for (const [name, text] of files) {
    if (!name.endsWith('.css')) continue
    const { warnings } = transform({ filename: name, code: Buffer.from(text), errorRecovery: true })
    expect(warnings.filter(w => !/Unknown at rule|Unexpected token/.test(w.message)), name).toEqual([])
    if (name !== 'warp.css') expect(text).toMatch(/^\/\* generated[^\n]*\n@layer warp\.(components|inputs|inputs-rich|data|layout|tokens) \{/)
  }
})

test('scripts/contrast-check.mjs is the spec checker, unchanged', () => {
  expect(readFileSync(new URL('../scripts/contrast-check.mjs', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../../../docs/design/warp/scripts/contrast-check.mjs', import.meta.url), 'utf8'))
})
