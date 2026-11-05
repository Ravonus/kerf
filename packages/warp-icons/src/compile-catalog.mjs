import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

/** The icons that have an action, read from the generated names. */
export const actionList = () =>
  [
    ...readFileSync(new URL('./gen/names.ts', import.meta.url), 'utf8')
      .match(/const actions = (\[.*?\])/)[1]
      .matchAll(/"([a-z0-9-]+)"/g),
  ].map((m) => m[1])
/** Every icon name, read from the generated names. */
export const list = () => [
  ...new Set(
    [
      ...readFileSync(new URL('./gen/names.ts', import.meta.url), 'utf8')
        .split('\n')[1]
        .matchAll(/"([a-z0-9-]+)"/g),
    ].map((m) => m[1]),
  ),
]

/** What the pack costs if a page takes it: every icon in one tier, brotli. */
export function packCost() {
  const code = readFileSync(new URL('./gen/all.tsx', import.meta.url), 'utf8')
  return brotliCompressSync(Buffer.from(code), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
    .length
}

/** `weft check`'s view: the same walk a build does, as findings. */
export function findings(root, analyze) {
  const catalog = list(),
    r = analyze(root, { catalog })
  const kb = `${(packCost() / 1024).toFixed(0)} KB`
  return [
    ...r.unknown.map((u) => ({
      code: 'I001',
      file: u.file,
      line: u.line,
      column: u.column,
      why: u.why ?? `no icon '${u.name}', did you mean '${u.suggest}'?`,
    })),
    ...r.dynamic.map((d) => ({
      code: 'I002',
      file: d.file,
      line: d.line,
      column: d.column,
      why: `\`${d.why}\` isn't known until runtime, so this use loads the icon pack lazily (about ${kb} br, only on pages that reach it).`,
    })),
    ...r.escaped.map((d) => ({
      code: 'I003',
      file: d.file,
      line: d.line,
      column: d.column,
      why: `${d.why}, so every icon ships with the page (about ${kb} br).`,
    })),
  ]
}

/** Every icon and variant as a static .svg, for a CDN or bucket. Writes files; nothing is uploaded. */
export async function publish(dir) {
  const { load } = await import('../scripts/build.mjs')
  const { forms } = await import('../scripts/forms.mjs')
  const icons = await load()
  mkdirSync(dir, { recursive: true })
  const svg = (html) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${html}</svg>\n`
  let files = 0
  for (const [name, entry] of Object.entries(icons)) {
    const f = forms(name, entry)
    const all = { '': f.hollow.line + f.hollow.pixels, '.solid': f.solid.line + f.solid.pixels }
    for (const [suffix, html] of Object.entries(all)) {
      writeFileSync(join(dir, `${name}${suffix}.svg`), svg(html))
      files++
    }
  }
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ icons: Object.keys(icons), variants: ['', 'solid'] }) + '\n',
  )
  return { dir, files, icons: Object.keys(icons).length }
}
