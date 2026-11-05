// Regenerate the vendored KEEL bundles from the pinned commit, without editing the KEEL checkout.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PIN, stageSource } from './vendor/archive.mjs'
import { bundle, checkHash } from './vendor/bundle.mjs'
import { verify, verifyNoExtras } from './vendor/verify.mjs'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(pkg, 'scripts', 'vendor')
const vendor = join(pkg, 'vendor')
const LICENSE = 'b31d726f66ceebf29c70ab9daa614db526544c2c921fb3b7ac2a299d6ee35110'
const UPSTREAM_LICENSE = 'cabead0e38fc8766f174225e5e9a5c566cc4570676bb0bc31ca23f7af143211a'
const readme = `# vendor

Built by \`scripts/vendor.mjs\` from keel-engine ${PIN.slice(0, 7)} (MIT; see LICENSE).
The checked patches move the pinned bundles into local modules. Don't edit generated modules directly.

The existing LICENSE is preserved byte-for-byte. At the pinned commit, upstream's LICENSE names
Chad Koslovsky and contributors; the preserved vendored copy names ravonus.

- \`keel-render.mjs\`: \`createPixelRenderer\` from \`packages/render\` and its local modules.
- \`keel-theme.mjs\`: \`recipeTheme\` and \`themeTokens\` from \`packages/react/src/design.ts\` and their local modules.
- \`keel-styles.css\`: \`packages/react/src/styles.css\`.
`

/** Build every generated file from the pinned commit, retaining the existing vendored licence. */
export async function generate(repo, license = readFileSync(join(vendor, 'LICENSE'))) {
  checkHash(license, LICENSE, 'vendored LICENSE')
  const source = stageSource(repo)
  try {
    checkHash(readFileSync(join(source, 'LICENSE')), UPSTREAM_LICENSE, 'pinned upstream LICENSE')
    const out = new Map([
      ['LICENSE', license],
      ['README.md', readme],
      ['keel-styles.css', readFileSync(join(source, 'packages/react/src/styles.css'))],
    ])
    for (const kind of ['render', 'theme'])
      for (const [name, text] of await bundle(kind, source, scripts)) out.set(name, text)
    return out
  } finally {
    rmSync(source, { recursive: true, force: true })
  }
}

/** Write the output after checking that no unknown companion module would be left behind. */
export function writeGenerated(outputs, dir = vendor) {
  verifyNoExtras(outputs, dir)
  for (const [name, data] of outputs) {
    if (name === 'LICENSE') continue
    const file = join(dir, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const repo = resolve(process.argv[2] ?? join(homedir(), 'dev/keel-engine'))
  const outputs = await generate(repo)
  writeGenerated(outputs)
  verify(outputs, vendor)
  console.log(`Vendored KEEL ${PIN.slice(0, 7)}: ${outputs.size} files`)
}
