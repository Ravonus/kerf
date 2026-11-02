// `weft tokens`: warp's resolved tokens as DTCG 2025.10 (PLAN §6, research 36), for Figma, Style Dictionary and Terrazzo.
// warp owns the values, so this asks the app's warp, with the app's seed and overrides, and writes what it returns.

import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadConfig } from './load-config.mjs'

export async function writeTokens(root) {
  root = resolve(root)
  let plugin
  try {
    plugin = await import(pathToFileURL(createRequire(join(root, 'package.json')).resolve('@weft-js/warp/plugin')).href)
  } catch {
    throw Object.assign(new Error('`weft tokens` exports warp\'s tokens, and this app has no @weft-js/warp'), { code: 'E_NO_WARP' })
  }
  const css = (await loadConfig(root)).contributions.find(c => c.name === '@weft-js/warp')?.manifest.tokens?.css ?? ''
  const dir = join(root, '.weft', 'tokens')
  mkdirSync(dir, { recursive: true })
  const files = plugin.dtcg(css)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), `${JSON.stringify(content, null, 2)}\n`)
  return { ok: true, dir: '.weft/tokens', files: Object.keys(files) }
}
