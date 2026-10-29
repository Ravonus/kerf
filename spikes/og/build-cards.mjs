// Compiles cards/*.tsx with weft's compiler (`generate: 'ssr'`, not hydratable) and bundles them with weft/ssr into
// build/cards.mjs, one ES module that runs on Node, Bun and workerd: `defaultCard(props)`, `avatarCard(props)` and
// `stressCard(props)` → HTML.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const weft = resolve(here, '../../packages/weft')
const { transform } = createRequire(import.meta.url)(join(weft, 'compiler.cjs'))

const compileTsx = {
  name: 'weft-ssr',
  setup(b) {
    b.onResolve({ filter: /^weft\/ssr$/ }, () => ({ path: join(weft, 'src/ssr.ts') }))
    b.onLoad({ filter: /cards[\\/].*\.tsx$/ }, args => {
      const out = transform(readFileSync(args.path, 'utf8'), { filename: args.path, generate: 'ssr', hydratable: false })
      const errors = out.diagnostics.filter(d => d.severity === 'error')
      if (errors.length) return { errors: errors.map(d => ({ text: `${d.code} ${d.message}`, location: { file: args.path, line: d.line, column: d.column - 1 } })) }
      return { contents: out.code, loader: 'ts' }
    })
  },
}

const entry = `
import { renderToString } from 'weft/ssr'
import { DefaultCard } from './cards/Default.tsx'
import { AvatarCard } from './cards/Avatar.tsx'
import { StressCard } from './cards/Stress.tsx'
export const defaultCard = props => renderToString(() => DefaultCard(props), { hydratable: false })
export const avatarCard = props => renderToString(() => AvatarCard(props), { hydratable: false })
export const stressCard = props => renderToString(() => StressCard(props), { hydratable: false })
`
mkdirSync(join(here, 'build'), { recursive: true })
const r = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'js' },
  bundle: true, format: 'esm', platform: 'neutral', minify: true, metafile: true,
  outfile: join(here, 'build/cards.mjs'), plugins: [compileTsx], logLevel: 'warning',
})
const bytes = Object.values(r.metafile.outputs)[0].bytes
writeFileSync(join(here, 'build/cards.size.json'), JSON.stringify({ bytes }))
console.log(`build/cards.mjs ${bytes} B (weft/ssr + 3 cards, minified)`)
