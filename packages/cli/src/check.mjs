// `weft check`: compile every project file in check mode, add the project view, the X-codes (text-checks.mjs), plugin
// `check` hooks, the test T-codes, the config P-codes and the style D-codes (style.mjs), and keep `.weft/styles.json`
// current when the project has style groups.

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { diagnostic, locate, positions, sortDiagnostics, summarize } from './diag.mjs'
import { discover } from './files.mjs'
import { loadConfig } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { projectView } from './project.mjs'
import { classSoup, matrixDiagnostics, styleFiles, styleModule, writeMatrixFile } from './style.mjs'
import { checkTests, isTestFile, testGlobs } from './tests.mjs'
import { pluginChecks } from './plugin-checks.mjs'
import { stateChecks } from './state-checks.mjs'
import { surfaceChecks } from './surface-checks.mjs'
import { textChecks } from './text-checks.mjs'
import { loadCompiler, resolveWeft } from './weft.mjs'
import { schemaHash } from './start.mjs'

const posix = p => p.split('\\').join('/')

/** Q015: the schema's hash against the one `weft db generate` recorded (research 28 §2). */
function schemaDrift(root) {
  const schema = join(root, 'src', 'db', 'schema.ts')
  if (!existsSync(schema) || !existsSync(join(root, 'drizzle.config.ts'))) return []
  const file = join(root, 'drizzle', '.schema-hash')
  if (existsSync(file) && readFileSync(file, 'utf8').trim() === schemaHash(readFileSync(schema))) return []
  return [diagnostic({ code: 'Q015', file: 'src/db/schema.ts', why: existsSync(file) ? 'The schema changed since the last `weft db generate`: the database will not match it.' : 'No migrations yet: the first request that reads a table fails with Q014.' })]
}

/**
 * @param {string} root
 * @param {{ files?: string[] }} [options] files relative to `root` (or absolute); default: discovered
 */
export async function check(root, options = {}) {
  const started = performance.now()
  root = resolve(root)
  const weft = resolveWeft(root)
  const compiler = loadCompiler(weft)
  const loaded = await loadConfig(root)
  const { config } = loaded
  // Slot modules and plugin token files stay current with the config (research 13 §2.6).
  if (!loaded.diagnostics.some(d => d.code === 'P007') && (config.plugins?.length || existsSync(join(root, '.weft', 'slots')))) sync(root, loaded)

  const exclude = [...(config.check?.exclude ?? []), ...(config.scope?.forbid ?? [])]
  const given = options.files?.map(f => posix(relative(root, isAbsolute(f) ? f : join(root, f))))
  const include = config.check?.include ?? ['**/*.{tsx,jsx}']
  const rels = given?.length ? given.filter(f => /\.[jt]sx$/.test(f) || !isTestFile(f)) : discover(root, { include, exclude })
  const testRels = given?.length ? given.filter(isTestFile) : discover(root, { include: config.test?.include ?? testGlobs, exclude })

  // Style groups (research 23): the project's definitions first, so each file compiles with the groups it imports.
  const style = await styleModule(weft)
  const sfiles = style ? styleFiles(root, config) : []
  const scan = sfiles.some(f => readFileSync(join(root, f), 'utf8').includes('weft/style')) ? style.scanProject(root, sfiles, compiler.transform) : null

  const files = []
  const posByAbs = new Map()
  for (const rel of rels) {
    const abs = join(root, rel)
    const text = readFileSync(abs, 'utf8')
    const pos = positions(text)
    posByAbs.set(abs, pos)
    const groups = scan ? style.importedGroups(abs, text, f => scan.groups.filter(g => join(root, g.file) === f)) : {}
    const out = compiler.transform(text, Object.keys(groups).length ? { filename: abs, checkOnly: true, groups } : { filename: rel, checkOnly: true })
    const diagnostics = out.diagnostics.map(d => {
      const start = pos.fromByte(d.start)
      const end = pos.fromByte(d.end)
      const fix = d.fix && {
        description: d.fix.description,
        safe: d.fix.safe,
        edits: d.fix.edits.map(e => {
          const a = pos.fromByte(e.start)
          const b = pos.fromByte(e.end)
          return { file: rel, span: pos.span(a, b), offset: [a, b], text: e.text }
        }),
      }
      return diagnostic({ code: d.code, severity: d.severity, file: rel, span: pos.span(start, end), offset: [start, end], why: d.message, help: d.help, fix })
    })
    files.push({ abs, rel, text, diagnostics })
  }

  projectView(files, file => posByAbs.get(file.abs))

  const matrix = scan && style.buildMatrix(scan.groups, scan.uses)
  if (matrix && scan.groups.length) writeMatrixFile(root, matrix)
  const styles = [...classSoup(files.filter(f => /\.[jt]sx$/.test(f.rel))), ...(matrix ? matrixDiagnostics(root, matrix) : [])]

  const fontBuild = typeof loaded.slots['font.build'] === 'string' && !loaded.slots['font.build'].startsWith('weft:default')
  const diagnostics = [
    ...loaded.diagnostics,
    ...files.flatMap(f => f.diagnostics),
    ...styles,
    ...textChecks(root, { files, exclude, fontBuild }),
    ...stateChecks(root, { files, exclude }),
    ...surfaceChecks(root, { files, exclude, slots: loaded.slots }),
    ...(await pluginChecks(root, loaded, { files, exclude })),
    ...checkTests(root, testRels),
    ...hygiene(root),
    ...schemaDrift(root),
  ]
  sortDiagnostics(diagnostics)
  const summary = { files: files.length, tests: testRels.length, ...summarize(diagnostics) }
  return {
    version: 1,
    ok: summary.errors === 0,
    root,
    weft: { version: weft.version, from: weft.from, compiler: weft.compilerPath },
    config: loaded.file ? posix(relative(root, loaded.file)) : null,
    summary,
    diagnostics,
    slots: loaded.slots,
    styles: matrix ? { groups: Object.keys(matrix.groups).length, matrix: '.weft/styles.json' } : null,
    files: rels,
    tests: testRels,
    ms: Math.round(performance.now() - started),
  }
}

/** weft owns the connection: these bypass reconnects, resume and the fake transport (research 30 §8). */
const SOCKET_PACKAGES = ['ws', 'socket.io-client', 'reconnecting-websocket', '@microsoft/fetch-event-source']

/** P002 (`package.json` scripts that aren't `weft …`), P120 (weft plugins wired straight into Vite), R007 (socket libraries). */
function hygiene(root) {
  const out = []
  const pkgFile = join(root, 'package.json')
  if (existsSync(pkgFile)) {
    const text = readFileSync(pkgFile, 'utf8')
    let scripts = {}, deps = {}
    try {
      const pkg = JSON.parse(text)
      scripts = pkg.scripts ?? {}
      deps = pkg.dependencies ?? {}
    } catch {}
    for (const name of SOCKET_PACKAGES) {
      if (deps[name]) out.push(diagnostic({ code: 'R007', file: 'package.json', ...locate(text, `"${name}"`), why: `\`${name}\` is a dependency: its connection has no resume, no cleanup and no fake in weft/test. Use \`stream\` or \`.live()\`.` }))
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/^weft(\s|$)/.test(cmd.trim())) {
        out.push(diagnostic({ code: 'P002', file: 'package.json', ...locate(text, `"${name}"`), why: `Script \`${name}\` runs \`${cmd}\`, not \`weft …\`: agents can't see what it does or what it touches.` }))
      }
    }
  }
  for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/from\s+['"](@weft\/plugin-[\w-]+)/g)) {
      out.push(diagnostic({ code: 'P120', file: name, ...locate(text, m[1]), why: `\`${m[1]}\` is registered in ${name}, which bypasses weft.config.ts.` }))
    }
  }
  return out
}
