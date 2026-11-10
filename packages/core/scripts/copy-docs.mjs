// Copies the reference pages (packages/cli/docs, what `weft docs` prints) into this package's docs/ at pack time, so
// they ship with @weft-js/core and can be read offline from node_modules/@weft-js/core/docs. Run by `prepack`.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '../../cli/docs')
const to = join(here, '../docs')
if (!existsSync(from)) throw new Error(`copy-docs: no ${from}; pack from a Weft checkout`)
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })

const pages = readdirSync(to)
  .filter((f) => f.endsWith('.md'))
  .sort()
const title = (f) =>
  readFileSync(join(to, f), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('# '))
    ?.slice(2)
    .trim() ?? f.slice(0, -3)
writeFileSync(
  join(to, 'README.md'),
  `# Weft reference

These are the pages \`npx weft docs <topic>\` prints, shipped with \`@weft-js/core\` so they can be read offline.
The same pages are on GitHub: https://github.com/Ravonus/weft/tree/main/packages/cli/docs

| Page | Topic |
| --- | --- |
${pages.map((f) => `| [${f}](./${f}) | ${title(f)} |`).join('\n')}
`,
)
console.log(`copy-docs: ${pages.length} pages to docs/`)
