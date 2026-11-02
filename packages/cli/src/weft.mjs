// The installed weft: its compiler (only through the public `@weft-js/core/compiler` transform()), version and exports.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const own = createRequire(import.meta.url)

/** The project's own weft wins; the CLI's weft (its dev/peer dependency) is the fallback. */
export function resolveWeft(root) {
  const tries = [() => createRequire(join(root, 'package.json')).resolve('@weft-js/core/compiler'), () => own.resolve('@weft-js/core/compiler')]
  for (const [i, attempt] of tries.entries()) {
    let path
    try {
      path = attempt()
    } catch {
      continue
    }
    let dir = dirname(path)
    while (!existsSync(join(dir, 'package.json')) && dirname(dir) !== dir) dir = dirname(dir)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return { from: i === 0 ? 'project' : 'cli', dir, version: pkg.version, pkg, compilerPath: path }
  }
  throw Object.assign(new Error('weft is not installed: `@weft-js/core/compiler` resolves neither from the project nor from @weft-js/cli'), { code: 'E_NO_WEFT' })
}

const compilers = new Map()

/** @returns {{ transform(source: string, options?: object): { code: string | null, diagnostics: any[] } }} */
export function loadCompiler(weft) {
  if (!compilers.has(weft.compilerPath)) compilers.set(weft.compilerPath, own(weft.compilerPath))
  return compilers.get(weft.compilerPath)
}

/** Exported names per public subpath, read from the installed package's entry files (no execution). */
export function exportsOf(weft, subpaths = ['.', './dom', './ssr', './test', './browser', './interaction', './style', './surface']) {
  const out = {}
  for (const sub of subpaths) {
    const target = weft.pkg.exports?.[sub]
    const file = typeof target === 'string' ? join(weft.dir, target) : null
    if (!file || !/\.[mc]?[jt]sx?$/.test(file) || !existsSync(file)) continue
    const names = new Set()
    const read = file => {
      const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const node of sf.statements) {
        const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
        if (ts.isExportDeclaration(node) && !node.exportClause && !node.isTypeOnly) {
          // `export * from './index'`: the `weft` entry is a thin one over the runtime.
          const next = join(dirname(file), `${node.moduleSpecifier.text}.ts`)
          if (existsSync(next)) read(next)
        } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
          if (!node.isTypeOnly) for (const el of node.exportClause.elements) if (!el.isTypeOnly) names.add(el.name.text)
        } else if (exported && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
          names.add(node.name.text)
        } else if (exported && ts.isVariableStatement(node)) {
          for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text)
        }
      }
    }
    read(file)
    out[sub === '.' ? '@weft-js/core' : `@weft-js/core/${sub.slice(2)}`] = [...names].sort()
  }
  return out
}
