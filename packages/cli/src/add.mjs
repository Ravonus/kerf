// `weft add`: what the wizard offers, on an app that already exists (research 34 §7). It installs a plugin and adds it to
// the config, whichever format that is. It only ever inserts, and stops rather than guess at a config it can't read.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { writeAgentsMd } from './agents-md.mjs'
import { findConfig, loadConfig, pluginFactory, pluginName } from './load-config.mjs'
import { sync } from './plugins.mjs'

const usageError = message => Object.assign(new Error(message), { code: 'E_USAGE' })
const refused = message => Object.assign(new Error(message), { code: 'E_ADD' })

const ALIASES = { warp: '@weft/warp', text: '@weft/plugin-text', media: '@weft/plugin-media', 'surface-keel': '@weft/plugin-surface-keel' }
/** Features 3x hasn't built: an honest answer beats treating them as a package name. */
const COMING = { db: 'database layers (research 34 slice C)', auth: 'auth providers (slice D)', tailwind: 'the Tailwind adapter (slice B)' }

const INSTALL = { 'pnpm-lock.yaml': ['pnpm', 'add'], 'bun.lock': ['bun', 'add'], 'yarn.lock': ['yarn', 'add'], 'package-lock.json': ['npm', 'install'] }

function installer(root) {
  const lock = Object.keys(INSTALL).find(f => existsSync(join(root, f)))
  return INSTALL[lock] ?? INSTALL['package-lock.json']
}

/** The import to write: `<pkg>/plugin` when the package has one, and however it exports its factory. */
function pluginImport(root, pkg) {
  const require = createRequire(join(root, 'package.json'))
  const name = pluginName(pkg)
  for (const spec of [`${pkg}/plugin`, pkg]) {
    let path
    try {
      path = require.resolve(spec)
    } catch {
      continue
    }
    const factory = pluginFactory(createRequire(import.meta.url)(path), pkg)
    if (!factory) throw refused(`${spec} exports no plugin factory to call, so nothing was changed.`)
    return { name: factory.name, line: `import ${factory.named ? `{ ${factory.name} }` : factory.name} from '${spec}'` }
  }
  return { name, line: `import ${name} from '${pkg}'` } // not installed yet: only a dry run gets this far
}

/** The object literal `export default` gives, directly or through `defineConfig(…)`. */
function configObject(sf) {
  for (const st of sf.statements) {
    if (!ts.isExportAssignment(st)) continue
    const value = ts.isCallExpression(st.expression) ? st.expression.arguments[0] : st.expression
    if (value && ts.isObjectLiteralExpression(value)) return value
  }
  return null
}

function addToTs(root, file, text, pkg) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const object = configObject(sf)
  if (!object) throw refused(`${file} doesn't export a plain object, so \`weft add\` can't edit it. Add \`${pkg}\` to \`plugins\` by hand.`)
  const { name, line } = pluginImport(root, pkg)
  const prop = object.properties.find(p => p.name?.getText(sf) === 'plugins')
  if (prop && !(ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer))) throw refused(`\`plugins\` in ${file} isn't a plain array, so \`weft add\` can't edit it. Add \`${pkg}\` by hand.`)
  const edits = []
  const imports = sf.statements.filter(ts.isImportDeclaration)
  const after = imports.at(-1)?.end ?? 0
  edits.push([after, `${imports.length ? '\n' : ''}${line}${imports.length ? '' : '\n'}`])
  if (prop) {
    const list = prop.initializer
    const last = list.elements.at(-1)
    edits.push(last ? [last.end, `, ${name}()`] : [list.getStart(sf) + 1, `${name}()`])
  } else {
    const last = object.properties.at(-1)
    edits.push(last ? [object.properties.end, `${object.properties.hasTrailingComma ? '' : ','}\n  plugins: [${name}()],`] : [object.getStart(sf) + 1, `\n  plugins: [${name}()],\n`])
  }
  return edits.toSorted((a, b) => b[0] - a[0]).reduce((t, [at, insert]) => t.slice(0, at) + insert + t.slice(at), text)
}

function addToData(file, text, pkg) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(text)
    data.plugins = [...(data.plugins ?? []), pkg]
    return `${JSON.stringify(data, null, 2)}\n`
  }
  const { parseDocument } = createRequire(import.meta.url)('yaml')
  const doc = parseDocument(text)
  if (doc.has('plugins')) doc.addIn(['plugins'], pkg)
  else doc.set('plugins', [pkg])
  return doc.toString()
}

const listed = (config, pkg) => (config.plugins ?? []).some(p => p.name === pkg)

export async function addCommand(root, feature, { dryRun = false, install = true } = {}) {
  root = resolve(root)
  if (!feature) throw usageError(`weft add needs a plugin: ${Object.keys(ALIASES).join(', ')}, or a package name`)
  if (COMING[feature]) throw refused(`\`weft add ${feature}\` isn't built yet: ${COMING[feature]}. Nothing was changed.`)
  const pkg = ALIASES[feature] ?? feature
  const before = await loadConfig(root)
  const file = findConfig(root) ?? join(root, 'weft.config.ts')
  const config = relative(root, file)
  if (listed(before.config, pkg)) return { ok: true, already: true, package: pkg, config, actions: [] }

  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    actions.push(`install ${pkg} with ${manager}`)
    if (!dryRun) execFileSync(manager, [verb, pkg], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const text = existsSync(file) ? readFileSync(file, 'utf8') : "import { defineConfig } from 'weft/config'\n\nexport default defineConfig({})\n"
  const next = /\.(json|ya?ml)$/.test(file) ? addToData(file, text, pkg) : addToTs(root, file, text, pkg)
  actions.push(`add ${pkg} to ${config}`)
  if (dryRun) return { ok: true, package: pkg, config, actions, dryRun: true }

  writeFileSync(file, next)
  const after = await loadConfig(root)
  const failed = after.diagnostics.filter(d => d.severity === 'error')
  if (failed.length) {
    writeFileSync(file, text)
    throw refused(`${pkg} didn't load, so ${config} is back as it was: ${failed[0].code} ${failed[0].why}`)
  }
  sync(root, after)
  actions.push('regenerate .weft/slots')
  if (existsSync(join(root, 'AGENTS.md'))) {
    await writeAgentsMd(root)
    actions.push('regenerate AGENTS.md')
  }
  return { ok: true, package: pkg, config, actions }
}
