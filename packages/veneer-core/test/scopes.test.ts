// Every scope attribute re-declares the sys tokens. `data-theme` most of all: a build that targets browsers without
// light-dark() (LightningCSS, Vite's default) lowers each colour to variables that pick light or dark where the token is
// declared, so a themed island that doesn't declare them again keeps the page's colours under its own color-scheme.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const tokens = join(__dirname, '../../../docs/design/veneer/tokens')
const ATTRIBUTES = [
  'data-expression',
  'data-density',
  'data-form',
  'data-pointer',
  'data-motion',
  'data-flair',
  'data-theme',
  'data-veneer',
]

/** The selector lists that re-declare sys tokens: the ones that start at `:root, [data-expression]`. */
const scopeLists = (css: string) =>
  [...css.matchAll(/:root,\s*\[data-expression\][^{]*\{/g)].map((m) => m[0])

test('every sys-token scope list names every scope attribute, data-theme included', () => {
  const missing: string[] = []
  let lists = 0
  for (const file of readdirSync(tokens).filter((f) => f.endsWith('.css'))) {
    for (const list of scopeLists(readFileSync(join(tokens, file), 'utf8'))) {
      lists++
      for (const a of ATTRIBUTES) if (!list.includes(`[${a}]`)) missing.push(`${file}: [${a}]`)
    }
  }
  expect(lists).toBeGreaterThan(4)
  expect(missing).toEqual([])
})
