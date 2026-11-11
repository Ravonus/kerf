// A component's CSS reads tokens its family defines in `<family>/tokens.css`. That file only arrives with a component
// that imports it, so a component whose rules read one must import it too: otherwise, on a page without the family's
// frame (a SideNav without a Shell), the var() is empty, the declaration is invalid, and the rule quietly falls back.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const src = join(__dirname, '../src')
const styles = join(__dirname, '../../veneer-core/styles')
const read = (f: string) => readFileSync(join(styles, f), 'utf8')
const defined = (css: string) =>
  new Set([...css.matchAll(/(--veneer-[\w-]+)\s*:/g)].map((m) => m[1]!))
/** var(--x) with no fallback of its own. */
const reads = (css: string) => [...css.matchAll(/var\((--veneer-[\w-]+)\)/g)].map((m) => m[1]!)
const global = defined(read('veneer.css'))

test('a component imports the tokens file its family CSS reads from', () => {
  const missing: string[] = []
  for (const file of readdirSync(src).filter((f) => f.endsWith('.tsx'))) {
    const code = readFileSync(join(src, file), 'utf8')
    const pieces = [...code.matchAll(/@kerf-js\/veneer-core\/styles\/([\w-]+)\/([\w-]+)\.css/g)]
    const have = new Set(pieces.map((m) => `${m[1]}/${m[2]}.css`))
    const own = new Set(pieces.flatMap((m) => [...defined(read(`${m[1]}/${m[2]}.css`))]))
    for (const [, family, name] of pieces) {
      const tokens = `${family}/tokens.css`
      if (name === 'tokens' || have.has(tokens)) continue
      let theirs: Set<string>
      try {
        theirs = defined(read(tokens))
      } catch {
        continue
      }
      const used = reads(read(`${family}/${name}.css`)).filter(
        (v) => theirs.has(v) && !global.has(v) && !own.has(v),
      )
      if (used.length)
        missing.push(`${file}: ${family}/${name}.css reads ${[...new Set(used)].join(', ')}`)
    }
  }
  expect(missing).toEqual([])
})

// Navigation stands a route's generated shape in while it loads, on any page, so the paint for its placeholders can't
// wait for a <Shape> or <Skeleton> to be imported somewhere: it comes with the base every component loads.
test('the shared base brings the skeleton paint', () => {
  const base = readFileSync(join(src, 'styles.ts'), 'utf8')
  expect(base).toContain("'@kerf-js/veneer-core/styles/components/skeleton.css'")
})

// veneer()'s token overrides land on every scope root, the themed ones included (veneer-core/test/scopes.test.ts says why).
test("veneer()'s overrides land on every scope root, data-theme included", () => {
  const plugin = readFileSync(join(__dirname, '../plugin.mjs'), 'utf8')
  const scopes = /const SCOPES =\s*'([^']+)'/.exec(plugin)![1]!
  for (const a of [
    'expression',
    'density',
    'form',
    'pointer',
    'motion',
    'flair',
    'theme',
    'veneer',
  ])
    expect(scopes).toContain(`[data-${a}]`)
})
