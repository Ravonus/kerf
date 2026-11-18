// Source-only inventory shared by the shell build and the adoption check.
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { scanRoutes } from '../routes.mjs'
import { functionContracts, scanServerModules } from './server-functions.mjs'
import { parse, shellLoaderContract } from './syntax.mjs'

/** Locate the shared startup contract and the peer-only provider. */
export function bootstrapFiles(root) {
  const find = (base, extensions) =>
    extensions.map((ext) => join(root, `src/${base}.${ext}`)).find((file) => existsSync(file))
  return {
    contract: find('bootstrap', ['ts', 'tsx', 'js', 'jsx']),
    provider: find('bootstrap.server', ['ts', 'js']),
  }
}

/** Report all shell contract declarations missing from route and server modules, without importing them. */
export function checkShellContracts(
  root,
  routesDir,
  manifest = scanRoutes(root, routesDir && resolve(root, routesDir)),
) {
  const findings = []
  const inspect = (file, scan) => {
    const source = readFileSync(join(root, file), 'utf8')
    try {
      for (const { name, why, at } of scan(source, file)) {
        const line = source.slice(0, at).split('\n').length
        findings.push({ code: 'Q021', severity: 'error', file, line, name, why })
      }
    } catch {
      findings.push({
        code: 'Q021',
        severity: 'error',
        file,
        line: 1,
        name: 'module',
        why: 'Shell contract declarations could not be read. Fix this module’s syntax.',
      })
    }
  }
  for (const { file } of [...manifest.layouts, ...manifest.routes])
    inspect(file, shellLoaderContract)
  for (const file of scanServerModules(root, true)) {
    inspect(file, (source, rel) =>
      source.includes('@kerf-js/start') ? functionContracts(source, rel) : [],
    )
  }
  const { contract, provider } = bootstrapFiles(root)
  if (!!contract !== !!provider)
    findings.push({
      code: 'Q021',
      severity: 'error',
      line: 1,
      name: 'default',
      file: contract ? 'src/bootstrap.server.ts' : 'src/bootstrap.ts',
      why: contract
        ? 'Shell bootstrap requires a default-exported server provider.'
        : 'Shell bootstrap requires a default-exported release schema contract.',
    })
  for (const file of [contract, provider]) {
    if (!file) continue
    inspect(relative(root, file).split('\\').join('/'), (source, rel) => {
      const exported = parse(rel, source).program.body.some(
        (node) =>
          node.type === 'ExportDefaultDeclaration' ||
          (node.type === 'ExportNamedDeclaration' &&
            node.exportKind !== 'type' &&
            node.specifiers.some(
              (spec) => spec.exportKind !== 'type' && spec.exported.name === 'default',
            )),
      )
      return exported
        ? []
        : [
            {
              name: 'default',
              at: 0,
              why: 'Export the shell bootstrap declaration as the default.',
            },
          ]
    })
  }
  return findings
}

/** Refuse the whole release with every finding in the same error. */
export function requireShellContracts(root, routesDir, manifest) {
  const findings = checkShellContracts(root, routesDir, manifest)
  if (findings.length)
    throw Object.assign(
      new Error(
        findings
          .map(
            ({ code, file, line, name, why }) =>
              `${code}: ${file}:${line} \u0060${name}\u0060: ${why}`,
          )
          .join('\n'),
      ),
      { code: 'E_REFUSED' },
    )
}
