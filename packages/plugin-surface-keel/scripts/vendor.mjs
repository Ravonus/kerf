// Regenerates vendor/ from a keel-engine checkout: esbuild bundles of its pixel renderer and theme recipes, unminified,
// with the licence. Reads keel-engine only.   node scripts/vendor.mjs [path to keel-engine]
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keel = resolve(process.argv[2] ?? join(homedir(), 'dev/keel-engine'))
const vendor = join(pkg, 'vendor')
mkdirSync(vendor, { recursive: true })
const out = (name, stdin) => esbuild.build({ stdin: { contents: stdin, resolveDir: keel, loader: 'ts' }, bundle: true, format: 'esm', target: 'es2022', outfile: join(vendor, name), logLevel: 'warning', legalComments: 'inline' })
await out('keel-render.mjs', "export { createPixelRenderer } from './packages/render/src/pixel-renderer.ts'")
await out('keel-theme.mjs', "export { recipeTheme, themeTokens } from './packages/react/src/design.ts'")
copyFileSync(join(keel, 'LICENSE'), join(vendor, 'LICENSE'))
copyFileSync(join(keel, 'packages/react/src/styles.css'), join(vendor, 'keel-styles.css'))
const commit = execFileSync('git', ['-C', keel, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync(join(vendor, 'README.md'), `# vendor\n\nBuilt by \`scripts/vendor.mjs\` from keel-engine ${commit} (MIT, Copyright (c) 2026 Chad Koslovsky and contributors; see LICENSE).\nDon't edit these files: fix KEEL and run the script again.\n\n- \`keel-render.mjs\`: \`createPixelRenderer\` from \`packages/render\`, with what it needs of \`packages/core\`.\n- \`keel-theme.mjs\`: \`recipeTheme\` and \`themeTokens\` from \`packages/react/src/design.ts\`.\n- \`keel-styles.css\`: \`packages/react/src/styles.css\`.\n`)
