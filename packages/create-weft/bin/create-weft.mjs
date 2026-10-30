#!/usr/bin/env node
// create-weft <dir> [--ui warp|headless|none] [--name <name>]
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { scaffold, UI } from '../src/index.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { ui: { type: 'string', default: 'warp' }, name: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help || positionals.length !== 1) {
  console.log(`Usage: create-weft <dir> [--ui ${UI.join('|')}] [--name <name>]\n\n  --ui warp      the warp kit, wired in through warp() (default)\n  --ui headless  @weft/ui-core's tokens and behaviour under your own markup\n  --ui none      weft and @weft/start only`)
  process.exit(values.help ? 0 : 1)
}
try {
  const dir = resolve(positionals[0])
  const { files } = scaffold(dir, { ui: values.ui, name: values.name })
  console.log(`Created ${files.length} files in ${dir}\n\n  cd ${positionals[0]}\n  npm install\n  npx weft dev`)
} catch (e) {
  console.error(`create-weft: ${e.message}`)
  process.exit(1)
}
