// `kerf tokens`: veneer's resolved tokens as DTCG 2025.10 (PLAN §6, research 37), for Figma, Style Dictionary and Terrazzo.
// veneer owns the values, so this asks the app's veneer, with the app's seed and overrides, and writes what it returns.

import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadConfig } from './load-config.mjs'

export async function writeTokens(root) {
  root = resolve(root)
  let plugin
  try {
    plugin = await import(
      pathToFileURL(createRequire(join(root, 'package.json')).resolve('@kerf/veneer/plugin')).href
    )
  } catch {
    throw Object.assign(
      new Error("`kerf tokens` exports veneer's tokens, and this app has no @kerf/veneer"),
      { code: 'E_NO_VENEER' },
    )
  }
  const css =
    (await loadConfig(root)).contributions.find((c) => c.name === '@kerf/veneer')?.manifest.tokens
      ?.css ?? ''
  const dir = join(root, '.kerf', 'tokens')
  mkdirSync(dir, { recursive: true })
  const files = plugin.dtcg(css)
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(dir, name), `${JSON.stringify(content, null, 2)}\n`)
  return { ok: true, dir: '.kerf/tokens', files: Object.keys(files) }
}
