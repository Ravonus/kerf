// Apply checked pure-move patches to the pinned bundles and emit the recorded module boundaries.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as esbuild from 'esbuild'

const HASHES = {
  render: {
    base: '17ad1331d51bc6518ade18182494e4b76df18d3585459f12239bb76c8babc4f3',
    moved: '2195b18f97844c6f1cc754d77e6e50945b8fb7dc39c88d4e136afd1a66a1a41e',
    entry: "export { createPixelRenderer } from './keel-render/renderer-api.mjs';\n",
    source: "export { createPixelRenderer } from './packages/render/src/pixel-renderer.ts'",
    tail: 'export {\n  createPixelRenderer\n};',
  },
  theme: {
    base: '34ec854789563e6c748a674594eea0ea9c9eea7581f88b1b7f6f6f4509188fb3',
    moved: '392feb87ca4bfd79addd07a264b59d2457fc0e1189fc82f944d51798e8ac06e6',
    entry: "export { recipeTheme, themeTokens } from './keel-theme/schema-theme.mjs';\n",
    source: "export { recipeTheme, themeTokens } from './packages/react/src/design.ts'",
    tail: 'export {\n  recipeTheme,\n  themeTokens\n};',
  },
}

export const digest = (data) => createHash('sha256').update(data).digest('hex')

export function checkHash(data, expected, label) {
  const actual = digest(data)
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

async function original(kind, source) {
  if (esbuild.version !== '0.28.2')
    throw new Error(`Expected esbuild 0.28.2, got ${esbuild.version}`)
  const result = await esbuild.build({
    stdin: { contents: HASHES[kind].source, resolveDir: source, loader: 'ts' },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    outfile: join(source, `keel-${kind}.mjs`),
    write: false,
    logLevel: 'warning',
    legalComments: 'inline',
  })
  return result.outputFiles[0].text.replace(/^\/\/ [^\n]*?\/packages\//gm, '// packages/')
}

export function splitMoved(kind, text, manifest) {
  const spec = HASHES[kind]
  checkHash(text, spec.moved, `${kind} moved bundle`)
  const files = new Map()
  let end = 0
  for (const item of manifest) {
    if (item.begin !== end || item.end <= item.begin || !/^[a-z-]+\.mjs$/.test(item.name))
      throw new Error(`${kind}: invalid module coverage at ${item.name}`)
    const name = `keel-${kind}/${item.name}`
    if (files.has(name)) throw new Error(`${kind}: duplicate module ${item.name}`)
    files.set(name, item.prefix + text.slice(item.begin, item.end) + item.suffix)
    end = item.end
  }
  if (text.slice(end).trim() !== spec.tail) throw new Error(`${kind}: unmatched bundle tail`)
  files.set(`keel-${kind}.mjs`, spec.entry)
  return files
}

export async function bundle(kind, source, scripts) {
  const spec = HASHES[kind]
  if (!spec) throw new Error(`Unknown bundle ${kind}`)
  const base = await original(kind, source)
  checkHash(base, spec.base, `${kind} pinned bundle`)
  const baseFile = join(source, `${kind}-base.mjs`)
  const movedFile = join(source, `${kind}-moved.mjs`)
  writeFileSync(baseFile, base)
  execFileSync('patch', ['-s', '-o', movedFile, baseFile, join(scripts, `${kind}.patch`)])
  const moved = readFileSync(movedFile, 'utf8')
  const manifest = JSON.parse(readFileSync(join(scripts, `${kind}-manifest.json`), 'utf8'))
  return splitMoved(kind, moved, manifest)
}
