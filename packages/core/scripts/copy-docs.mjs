// Copies the reference pages (packages/cli/docs, what `kerf docs` prints) into this package's docs/ at pack time, so
// they ship with @kerf-js/core and can be read offline from node_modules/@kerf-js/core/docs. Run by `prepack`.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '../../cli/docs')
const to = join(here, '../docs')
if (!existsSync(from)) throw new Error(`copy-docs: no ${from}; pack from a Kerf checkout`)
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
  `# Kerf reference

These are the pages \`npx kerf docs <topic>\` prints, shipped with \`@kerf-js/core\` so they can be read offline.
The same pages are on GitHub: https://github.com/Ravonus/kerf/tree/main/packages/cli/docs

| Page | Topic |
| --- | --- |
${pages.map((f) => `| [${f}](./${f}) | ${title(f)} |`).join('\n')}
`,
)
console.log(`copy-docs: ${pages.length} pages to docs/`)
