import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { parse } from './syntax.mjs'
import { isServerModule } from './server-functions.mjs'
import { NOT_ASSET, ASSETS } from './shared.mjs'

/** kerf's own packages from an install: a static component's stylesheets are in them, and they ship source. */
const KIT = /\/node_modules\/@kerf-js\/.*\.[jt]sx?$/

/**
 * The stylesheets a kit import reaches, in import order, written straight into the static module: chained `?kerf-assets`
 * modules from a package with `sideEffects` would be shaken away. `names` follows a barrel only to the components named,
 * so a page with one doesn't pull every component's sheet.
 */
async function kitAssets(ctx, file, names, seen, words) {
  const id = names ? `${file}|${names.join()}` : file
  if (seen.has(id)) return []
  seen.add(id)
  const code = readFileSync(file, 'utf8')
  const body = parse(file, code).program.body
  const wanted = (name) => !names || names.includes(name)
  const makes = ({ declaration: d, specifiers }) =>
    d?.declarations
      ? d.declarations.some((v) => v.id.type !== 'Identifier' || names.includes(v.id.name))
      : names.includes(d?.id?.name) ||
        specifiers.some((s) => names.includes(s.exported.name ?? s.exported.value))
  // Only a file that makes a name itself brings its own imports: one that passes it on is a barrel.
  const own =
    !names ||
    body.some(
      (n) =>
        n.type === 'ExportDefaultDeclaration' ||
        (n.type === 'ExportNamedDeclaration' && !n.source && makes(n)),
    )
  if (own) words?.add(code)
  const out = []
  for (const n of body) {
    if (!n.source || n.importKind === 'type' || n.exportKind === 'type') continue
    const all = n.type === 'ExportAllDeclaration'
    const space = all && n.exported && (n.exported.name ?? n.exported.value) // `export * as K`: K is the whole module
    const passed =
      n.type === 'ExportNamedDeclaration' &&
      n.specifiers
        .filter((s) => s.exportKind !== 'type' && wanted(s.exported.name ?? s.exported.value))
        .map((s) => s.local.name ?? s.local.value)
    // A bare import runs whatever the importer wants from the file.
    if (
      n.type === 'ImportDeclaration'
        ? !own && n.specifiers.length
        : passed
          ? !passed.length
          : !all || (space && !wanted(space))
    )
      continue
    if (/^@kerf-js\/(?:core|start)($|\/)/.test(n.source.value)) continue
    const target = (await ctx.resolve(n.source.value, file, { skipSelf: true }))?.id
    if (!target) continue
    const bare = target.replace(/\?.*$/, '')
    if (!NOT_ASSET.test(bare))
      out.push(`import ${JSON.stringify(target.startsWith('\0') ? n.source.value : bare)}`)
    else if (KIT.test(bare))
      out.push(
        ...(await kitAssets(
          ctx,
          bare,
          passed || (space ? undefined : all ? names : importedNames(n)),
          seen,
          words,
        )),
      )
  }
  return [...new Set(out)]
}

/** The value names an import takes, or undefined for the whole module (`import 'x'`, `import * as x`). */
const importedNames = (n) => {
  const names = (n.specifiers ?? [])
    .filter((s) => s.type === 'ImportSpecifier' && s.importKind !== 'type')
    .map((s) => (s.imported ?? s.local).name ?? (s.imported ?? s.local).value)
  return names.length && n.specifiers.every((s) => s.type === 'ImportSpecifier') ? names : undefined
}

/**
 * A static module in the client build: what it imports that isn't code (stylesheets, images), and the same of the
 * modules it imports. Its class names go to the purge, which only sees client files.
 */
export async function assetsOnly(ctx, code, path, root, words) {
  words?.add(code)
  const ast = parse(path, code)
  const out = []
  const seen = new Set()
  for (const n of ast.program.body) {
    if (
      !/^(ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration)$/.test(n.type) ||
      !n.source ||
      n.importKind === 'type' ||
      n.exportKind === 'type'
    )
      continue
    const spec = n.source.value
    if (/^@kerf-js\/(?:core|start)($|\/)/.test(spec)) continue
    const file = (await ctx.resolve(spec, path, { skipSelf: true }))?.id
    if (!file) continue
    const bare = file.replace(/\?.*$/, '')
    if (!NOT_ASSET.test(bare)) out.push(`import ${JSON.stringify(spec)}`)
    else if (KIT.test(bare))
      out.push(...(await kitAssets(ctx, bare, importedNames(n), seen, words)))
    else if (
      !bare.includes('/node_modules/') &&
      !isServerModule(relative(root, bare).split('\\').join('/'))
    )
      out.push(`import ${JSON.stringify(bare + ASSETS)}`)
  }
  if (code.includes('@kerf-js/core/style')) out.push(`import 'virtual:kerf/groups.css'`)
  out.push('export default null') // a chunk of only CSS is dropped, and the server looks this one up
  return out.join('\n') + '\n'
}
