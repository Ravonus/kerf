// The installed kerf: its compiler (only through the public `@kerf-js/core/compiler` transform()), version and exports.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const own = createRequire(import.meta.url)

/** The project's own kerf wins; the CLI's kerf (its dev/peer dependency) is the fallback. */
export function resolveKerf(root) {
  const tries = [
    () => createRequire(join(root, 'package.json')).resolve('@kerf-js/core/compiler'),
    () => own.resolve('@kerf-js/core/compiler'),
  ]
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
  throw Object.assign(
    new Error(
      'kerf is not installed: `@kerf-js/core/compiler` resolves neither from the project nor from @kerf-js/cli',
    ),
    { code: 'E_NO_KERF' },
  )
}

const compilers = new Map()

/** @returns {{ transform(source: string, options?: object): { code: string | null, diagnostics: any[] } }} */
export function loadCompiler(kerf) {
  if (!compilers.has(kerf.compilerPath)) compilers.set(kerf.compilerPath, own(kerf.compilerPath))
  return compilers.get(kerf.compilerPath)
}

/** Exported names per public subpath, read from the installed package's entry files (no execution). */
export function exportsOf(
  kerf,
  subpaths = [
    '.',
    './dom',
    './ssr',
    './test',
    './browser',
    './interaction',
    './style',
    './surface',
  ],
) {
  const out = {}
  for (const sub of subpaths) {
    const target = kerf.pkg.exports?.[sub]
    const file = typeof target === 'string' ? join(kerf.dir, target) : null
    if (!file || !/\.[mc]?[jt]sx?$/.test(file) || !existsSync(file)) continue
    /** @type {Set<string>} */
    const names = new Set()
    const read = (path) => {
      const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const node of sf.statements) {
        const exported =
          ts.canHaveModifiers(node) &&
          ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        if (ts.isExportDeclaration(node) && !node.exportClause && !node.isTypeOnly) {
          // `export * from './index'`: the `kerf` entry is a thin one over the runtime.
          const next = join(dirname(path), `${node.moduleSpecifier.text}.ts`)
          if (existsSync(next)) read(next)
        } else if (
          ts.isExportDeclaration(node) &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          if (!node.isTypeOnly)
            for (const el of node.exportClause.elements) if (!el.isTypeOnly) names.add(el.name.text)
        } else if (
          exported &&
          (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
          node.name
        ) {
          names.add(node.name.text)
        } else if (exported && ts.isVariableStatement(node)) {
          for (const d of node.declarationList.declarations)
            if (ts.isIdentifier(d.name)) names.add(d.name.text)
        }
      }
    }
    read(file)
    out[sub === '.' ? '@kerf-js/core' : `@kerf-js/core/${sub.slice(2)}`] = [...names].sort()
  }
  return out
}
