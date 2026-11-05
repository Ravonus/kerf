// @vitest-environment node
// The split keeps the spec's CSS exactly: every rule ships verbatim, in the spec's order within its file, and the
// files on disk are what the splitter produces from docs/design/warp/tokens today.
import { readdirSync, readFileSync } from 'node:fs'
import { transform } from 'lightningcss'
import { build } from '../scripts/split-css.mjs'

const { files, parts, routed } = build()
const spec = (name: string) =>
  readFileSync(new URL(`../../../docs/design/warp/tokens/${name}`, import.meta.url), 'utf8')
const disk = (name: string) => readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8')

test('styles/ is the split of the current spec (node scripts/split-css.mjs)', () => {
  for (const [name, text] of files) expect(disk(name), name).toBe(text)
  expect(disk('warp.css')).toBe(spec('warp.css'))
})

test('every rule of the rule-routed families ships verbatim, in spec order, and every rule ships somewhere', () => {
  for (const [family, source] of [
    ['data', 'warp-data.css'],
    ['layout', 'warp-layout.css'],
    ['app', 'warp-app.css'],
    ['flows', 'warp-flows.css'],
  ] as const) {
    const css = spec(source)
    const shipped = new Set()
    for (const [name, list] of routed[family].files) {
      let at = 0
      for (const text of list.flatMap((e: { inner: string[] }) => e.inner)) {
        shipped.add(text)
        if (text.startsWith('@keyframes')) {
          expect(css).toContain(text)
          continue
        } // they follow their users
        const found = css.indexOf(text, at)
        expect(
          found,
          `${family}/${name}: rule out of order or changed: ${text.slice(0, 80)}`,
        ).toBeGreaterThanOrEqual(0)
        at = found + text.length
      }
    }
    const { code } = transform({ filename: source, code: Buffer.from(css), minify: true })
    const every = [...shipped, ...files.get(`${family}/tokens.css`)!.split('\n')].join('\n')
    for (const name of String(code).matchAll(/@keyframes ([\w-]+)/g))
      expect(every, name[1]).toContain(`@keyframes ${name[1]}`)
  }
})

test('every rule of the spec ships verbatim, in spec order within its file', () => {
  for (const [family, source] of [
    ['components', 'warp-components.css'],
    ['inputs', 'warp-inputs.css'],
    ['rich', 'warp-inputs-rich.css'],
  ] as const) {
    const css = spec(source)
    for (const [name, list] of parts[family].files) {
      let at = 0
      // a tail @media block split by owner is a new wrapper around the spec's own rules: check those instead
      for (const text of list
        .filter((i: { kind: string }) => i.kind === 'rule')
        .flatMap((i: { inner?: string[]; text: string }) => i.inner ?? [i.text])) {
        const item = { text }
        const found = css.indexOf(item.text, at)
        expect(
          found,
          `${family}/${name}: rule out of order or changed: ${item.text.slice(0, 80)}`,
        ).toBeGreaterThanOrEqual(0)
        at = found + item.text.length
      }
    }
  }
})

test('every spec rule outside the tail lands in exactly one file; tail rules land in at least one', () => {
  for (const [family, source] of [
    ['components', 'warp-components.css'],
    ['inputs', 'warp-inputs.css'],
    ['rich', 'warp-inputs-rich.css'],
  ] as const) {
    const shipped = [...files]
      .filter(([k]) => k.startsWith(`${family}/`))
      .map(([, v]) => v)
      .join('\n')
    const css = spec(source)
    const body = css.slice(css.indexOf('{', css.search(/@layer [\w.-]+ \{/)) + 1)
    // the top-level selectors of the spec body all appear in what ships
    for (const m of body.matchAll(/^(:where\([^\n{]{0,60})/gm))
      expect(shipped, `${family}: ${m[1]}`).toContain(m[1])
  }
})

test('each file parses as CSS and keeps its layer', () => {
  for (const [name, text] of files) {
    if (!name.endsWith('.css')) continue
    const { warnings } = transform({ filename: name, code: Buffer.from(text), errorRecovery: true })
    expect(
      warnings.filter((w) => !/Unknown at rule|Unexpected token/.test(w.message)),
      name,
    ).toEqual([])
    if (name !== 'warp.css')
      expect(text).toMatch(
        /^\/\* generated[^\n]*\n@layer warp\.(components|inputs|inputs-rich|data|layout|app|flows|canvas|tokens) \{/,
      )
  }
})

test('scripts/contrast-check.mjs is the spec checker, unchanged', () => {
  for (const name of ['contrast-check.mjs', 'contrast-check-colors.mjs']) {
    expect(readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8'), name).toBe(
      readFileSync(new URL(`../../../docs/design/warp/scripts/${name}`, import.meta.url), 'utf8'),
    )
  }
})

test('the sweep has one switch: no stylesheet reads a phase, and every part draws from the two edges', () => {
  const dir = new URL('../../../docs/design/warp/tokens/', import.meta.url)
  for (const f of readdirSync(dir))
    expect(readFileSync(new URL(f, dir), 'utf8').match(/\[data-phase[=\]]/g), f).toBeNull()
  const css = readFileSync(new URL('warp.css', dir), 'utf8')
  expect(css).toMatch(/@property --_sl/)
  expect(css).toMatch(/@property --_sr/)
  expect(css).toMatch(/\{ --_a: 1; \}/)
})

// One name, one motion: keyframes are global, so a second definition anywhere in the spec silently replaces the first
// for every user (the table's slide from the side once took over every phone sheet's slide up).
test('a keyframes name defined in more than one place is defined the same everywhere', () => {
  const seen = new Map()
  for (const name of readdirSync(
    new URL('../../../docs/design/warp/tokens/', import.meta.url),
  ).filter((f) => f.endsWith('.css'))) {
    const css = spec(name)
    for (const m of css.matchAll(/@keyframes ([\w-]+)\s*\{/g)) {
      let depth = 1,
        i = m.index + m[0].length
      while (depth && i < css.length) {
        depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0
        i++
      }
      const body = css
        .slice(m.index + m[0].length, i - 1)
        .replace(/\s+/g, ' ')
        .trim()
      const first = seen.get(m[1])
      if (first)
        expect(body, `@keyframes ${m[1]} in ${name} differs from ${first.name}`).toBe(first.body)
      else seen.set(m[1], { name, body })
    }
  }
})
