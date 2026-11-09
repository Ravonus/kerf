// @vitest-environment node
// The split keeps the spec's CSS exactly: every rule ships verbatim, in the spec's order within its file, and the
// files on disk are what the splitter produces from docs/design/warp/tokens today.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import { build } from '../scripts/split-css.mjs'
import { split } from '../scripts/split-css/sections.mjs'
import { lowerTheme, themeNames } from '../scripts/theme-css.mjs'

const { files, parts, routed } = build()
const spec = (name: string) =>
  readFileSync(new URL(`../../../docs/design/warp/tokens/${name}`, import.meta.url), 'utf8')
const sourceDir = fileURLToPath(new URL('../../../docs/design/warp/tokens/', import.meta.url))
const themedComponents = split(sourceDir, 'warp-components.css', 'components')
const disk = (name: string) => readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8')

test('styles/ is the split of the current spec (node scripts/split-css.mjs)', () => {
  for (const [name, text] of files) expect(disk(name), name).toBe(text)
  expect(disk('warp.css')).toBe(lowerTheme(spec('warp.css'), themeNames))
  expect(disk('themed/warp.css')).toBe(spec('warp.css'))
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
    for (const lane of ['legacy', 'themed'] as const) {
      const css = lane === 'legacy' ? lowerTheme(spec(source), themeNames) : spec(source)
      const familyParts =
        lane === 'themed' && family === 'components' ? themedComponents : parts[family]
      for (const [name, list] of familyParts.files) {
        const path = `${family}/${name}.css`
        const key = lane === 'themed' && files.has(`themed/${path}`) ? `themed/${path}` : path
        const output = files.has(key) ? disk(key) : undefined
        if (!list.some((item: { kind: string }) => item.kind === 'rule')) continue
        expect(output, `${lane} ${path}: missing output`).toBeDefined()
        let at = 0
        for (const text of list
          .filter((i: { kind: string }) => i.kind === 'rule')
          .flatMap((i: { inner?: string[]; text: string }) => i.inner ?? [i.text])) {
          const found = css.indexOf(text, at)
          expect(
            found,
            `${lane} ${path}: source order or content: ${text.slice(0, 80)}`,
          ).toBeGreaterThanOrEqual(0)
          expect(output, `${lane} ${path}: missing rule: ${text.slice(0, 80)}`).toContain(text)
          at = found + text.length
        }
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
    for (const lane of ['legacy', 'themed'] as const) {
      const paths = [...files.keys()].filter((k) => k.startsWith(`${family}/`))
      const shipped = paths
        .map((path) =>
          disk(lane === 'themed' && files.has(`themed/${path}`) ? `themed/${path}` : path),
        )
        .join('\n')
      const css = lane === 'legacy' ? lowerTheme(spec(source), themeNames) : spec(source)
      const body = css.slice(css.indexOf('{', css.search(/@layer [\w.-]+ \{/)) + 1)
      for (const m of body.matchAll(/^(:where\([^\n{]{0,60})/gm))
        expect(shipped, `${lane} ${family}: ${m[1]}`).toContain(m[1])
      const familyParts =
        lane === 'themed' && family === 'components' ? themedComponents : parts[family]
      const owners = new Map<string, Set<string>>()
      for (const [name, list] of familyParts.files) {
        for (const item of list.filter((entry: { kind: string }) => entry.kind === 'rule')) {
          for (const text of item.inner ?? [item.text]) {
            if (!owners.has(text)) owners.set(text, new Set())
            owners.get(text)!.add(`${family}/${name}.css`)
          }
        }
      }
      const primary = [...familyParts.files.keys()].map((name) => `${family}/${name}.css`)
      for (const [text, expected] of owners) {
        const actual = primary.filter((path) => {
          const key = lane === 'themed' && files.has(`themed/${path}`) ? `themed/${path}` : path
          return files.has(key) && disk(key).includes(text)
        })
        expect(actual.sort(), `${lane} ${family}: owners of ${text.slice(0, 80)}`).toEqual(
          [...expected].sort(),
        )
      }
    }
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
    if (name !== 'warp.css' && name !== 'themed/warp.css')
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
