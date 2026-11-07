// A component's CSS reads tokens its family defines in `<family>/tokens.css`. That file only arrives with a component
// that imports it, so a component whose rules read one must import it too: otherwise, on a page without the family's
// frame (a SideNav without a Shell), the var() is empty, the declaration is invalid, and the rule quietly falls back.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const src = join(__dirname, '../src')
const styles = join(__dirname, '../../warp-core/styles')
const read = (f: string) => readFileSync(join(styles, f), 'utf8')
const defined = (css: string) =>
  new Set([...css.matchAll(/(--warp-[\w-]+)\s*:/g)].map((m) => m[1]!))
/** var(--x) with no fallback of its own. */
const reads = (css: string) => [...css.matchAll(/var\((--warp-[\w-]+)\)/g)].map((m) => m[1]!)
const global = defined(read('warp.css'))

test('a component imports the tokens file its family CSS reads from', () => {
  const missing: string[] = []
  for (const file of readdirSync(src).filter((f) => f.endsWith('.tsx'))) {
    const code = readFileSync(join(src, file), 'utf8')
    const pieces = [...code.matchAll(/@weft-js\/warp-core\/styles\/([\w-]+)\/([\w-]+)\.css/g)]
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
