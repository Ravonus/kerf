// `kerf check`: compile every project file in check mode, add the project view, the X-codes (text-checks.mjs), plugin
// `check` hooks, the test T-codes, the config P-codes, the style D-codes (style.mjs) and the design D-codes (design-checks.mjs), and keep `.kerf/styles.json`
// current when the project has style groups.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, positions, sortDiagnostics, summarize } from './diag.mjs'
import { discover } from './files.mjs'
import { isDataConfig, loadConfig, writeConfigSchema } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { writeMap } from './map.mjs'
import { projectView } from './project.mjs'
import { designChecks, hasTokens } from './design-checks.mjs'
import {
  classSoup,
  matrixDiagnostics,
  styleFiles,
  styleModule,
  usesTailwind,
  writeMatrixFile,
} from './style.mjs'
import { checkTests, isTestFile, testGlobs } from './tests.mjs'
import { pluginChecks } from './plugin-checks.mjs'
import { propChecks } from './props-checks.mjs'
import { reactChecks } from './react-checks.mjs'
import { trustDiagnostics } from './trust.mjs'
import { shareChecks } from './share-checks.mjs'
import { stateChecks } from './state-checks.mjs'
import { serverStateChecks } from './server-state-checks.mjs'
import { surfaceChecks } from './surface-checks.mjs'
import { textChecks } from './text-checks.mjs'
import { loadCompiler, resolveKerf } from './kerf.mjs'
import { dbLayer } from './db-layer.mjs'
import { loadEnv, routeDiagnostics, schemaHash, siteOf, start } from './start.mjs'
import { deployChecks } from './deploy/index.mjs'
import { rustChecks, liveChecks, socketChecks, hygiene } from './check/runtime.mjs'

const posix = (p) => p.split('\\').join('/')

/** Q015: the schema's hash against the one `kerf db generate` recorded (research 28 §2). */
function schemaDrift(root, layer) {
  const schema = layer?.schema && join(root, layer.schema)
  if (!schema || !existsSync(schema)) return []
  const file = join(root, layer.migrations, '.schema-hash')
  if (existsSync(file) && readFileSync(file, 'utf8').trim() === schemaHash(readFileSync(schema)))
    return []
  return [
    diagnostic({
      code: 'Q015',
      file: layer.schema,
      why: existsSync(file)
        ? 'The schema changed since the last `kerf db generate`: the database will not match it.'
        : 'No migrations yet: the first request that reads a table fails with Q014.',
    }),
  ]
}

/** I001–I003: the walk a build does (@kerf-js/veneer-icons/compile), when the project has the package. */
async function iconChecks(root) {
  const require = createRequire(join(root, 'package.json'))
  let compile
  for (const from of [
    () => require.resolve('@kerf-js/veneer-icons/compile'),
    () =>
      createRequire(require.resolve('@kerf-js/veneer')).resolve('@kerf-js/veneer-icons/compile'),
  ]) {
    try {
      compile = from()
      break
    } catch {
      /* not this way */
    }
  }
  if (!compile) return []
  const { findings } = await import(pathToFileURL(compile).href)
  return findings(root).map((f) =>
    diagnostic({
      code: f.code,
      file: f.file,
      span: [f.line, f.column, f.line, f.column],
      why: f.why,
    }),
  )
}

/** H010: what the last build or `kerf dev` found keeps an island from waiting (`.kerf/hydration.json`, @kerf-js/core/hydration). */
function hydrationChecks(root) {
  const file = join(root, '.kerf', 'hydration.json')
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
      .diagnostics.filter((d) => existsSync(join(root, d.file)))
      .map((d) =>
        diagnostic({
          code: d.code,
          file: d.file,
          span: [d.line, 1, d.line, 1],
          why: d.why,
          help: d.fix,
        }),
      )
  } catch {
    return []
  }
}

/**
 * H001–H007, H011–H016: page metadata, per route, on what the routes really produce (`inspect.mjs`). With `files`, only
 * when a route is among them. An app that can't run here is still read: a check never fails for what it couldn't start.
 */
async function routeChecks(root, loaded, given, reported) {
  if (
    !existsSync(join(root, 'src', 'routes')) ||
    loaded.config?.check?.routes === false ||
    loaded.diagnostics.some((d) => d.code === 'P007')
  )
    return []
  if (given?.length && !given.some((f) => f.startsWith('src/routes/'))) return []
  let inspect
  // The routes run as they do under `kerf dev`, so they get the same `.env` (an env schema throws without it).
  loadEnv(root)
  try {
    inspect = await start(root, 'inspect')
  } catch {
    return []
  }
  const keep = (list) =>
    routeDiagnostics(root, list).filter((d) => !(d.code === 'H001' && reported.has('H001')))
  try {
    return keep((await inspect.routesMeta({ root, site: siteOf(loaded) })).diagnostics)
  } catch (error) {
    return keep([
      ...inspect.staticRouteChecks(root),
      {
        code: 'H016',
        severity: 'info',
        file: 'src/routes',
        route: '*',
        why: `The routes didn't load here, so only their source was checked: ${String(error?.message ?? error).split('\n')[0]}`,
      },
    ])
  }
}

function compileFiles(root, rels, compiler, scan, style) {
  const files = []
  const posByAbs = new Map()
  for (const rel of rels) {
    const abs = join(root, rel)
    const text = readFileSync(abs, 'utf8')
    const pos = positions(text)
    posByAbs.set(abs, pos)
    const groups = scan
      ? style.importedGroups(abs, text, (f) => scan.groups.filter((g) => join(root, g.file) === f))
      : {}
    const out = compiler.transform(
      text,
      Object.keys(groups).length
        ? { filename: abs, checkOnly: true, groups }
        : { filename: rel, checkOnly: true },
    )
    const diagnostics = out.diagnostics.map((d) => {
      const from = pos.fromByte(d.start)
      const end = pos.fromByte(d.end)
      const fix = d.fix && {
        description: d.fix.description,
        safe: d.fix.safe,
        edits: d.fix.edits.map((e) => {
          const a = pos.fromByte(e.start)
          const b = pos.fromByte(e.end)
          return { file: rel, span: pos.span(a, b), offset: [a, b], text: e.text }
        }),
      }
      return diagnostic({
        code: d.code,
        severity: d.severity,
        file: rel,
        span: pos.span(from, end),
        offset: [from, end],
        why: d.message,
        help: d.help,
        fix,
      })
    })
    files.push({ abs, rel, text, diagnostics })
  }

  return { files, posByAbs }
}

async function collectDiagnostics({
  root,
  loaded,
  config,
  files,
  exclude,
  styles,
  testRels,
  options,
  given,
}) {
  const fontBuild =
    typeof loaded.slots['font.build'] === 'string' &&
    !loaded.slots['font.build'].startsWith('kerf:default')
  const diagnostics = [
    ...loaded.diagnostics,
    ...(loaded.diagnostics.some((d) => d.code === 'P007') ? [] : trustDiagnostics(root, loaded)),
    ...files.flatMap((f) => f.diagnostics),
    ...styles,
    ...(config.check?.design === false
      ? []
      : designChecks(root, { files, exclude, tokens: hasTokens(root) })),
    ...textChecks(root, { files, exclude, fontBuild }),
    ...stateChecks(root, { files, exclude }),
    ...serverStateChecks(root, { files, exclude }),
    ...shareChecks(root, { files }),
    ...reactChecks({ files }),
    ...surfaceChecks(root, { files, exclude, slots: loaded.slots }),
    ...(await pluginChecks(root, loaded, { files, exclude })),
    ...(await propChecks(root, config)),
    ...checkTests(root, testRels),
    ...(await iconChecks(root)),
    ...hydrationChecks(root),
    ...hygiene(root),
    ...(await socketChecks(root)),
    ...schemaDrift(root, await dbLayer(root, loaded)),
    ...(await rustChecks(root, loaded)),
    ...(await liveChecks(root, loaded, options.preset)),
    ...(loaded.diagnostics.some((d) => d.code === 'P007')
      ? []
      : deployChecks(root, config, { preset: options.preset })),
  ]
  diagnostics.push(
    ...(await routeChecks(root, loaded, given, new Set(loaded.diagnostics.map((d) => d.code)))),
  )
  sortDiagnostics(diagnostics)
  return diagnostics
}

/**
 * @param {string} root
 * @param {{ files?: string[] }} [options] files relative to `root` (or absolute); default: discovered
 */
export async function check(root, options = {}) {
  const started = performance.now()
  root = resolve(root)
  const kerf = resolveKerf(root)
  const compiler = loadCompiler(kerf)
  const loaded = await loadConfig(root)
  const { config } = loaded
  // Slot modules and plugin token files stay current with the config (research 13 §2.6).
  if (
    !loaded.diagnostics.some((d) => d.code === 'P007') &&
    (config.plugins?.length || existsSync(join(root, '.kerf', 'slots')))
  )
    sync(root, loaded)

  if (loaded.file && isDataConfig(loaded.file)) writeConfigSchema(root)
  if (existsSync(join(root, '.kerf'))) await writeMap(root)

  const exclude = [...(config.check?.exclude ?? []), ...(config.scope?.forbid ?? [])]
  const given = options.files?.map((f) => posix(relative(root, isAbsolute(f) ? f : join(root, f))))
  const include = config.check?.include ?? ['**/*.{tsx,jsx}']
  const rels = given?.length
    ? given.filter((f) => /\.[jt]sx$/.test(f) || !isTestFile(f))
    : discover(root, { include, exclude })
  const testRels = given?.length
    ? given.filter(isTestFile)
    : discover(root, { include: config.test?.include ?? testGlobs, exclude })

  // Style groups (research 23): the project's definitions first, so each file compiles with the groups it imports.
  const style = await styleModule(kerf)
  const sfiles = style ? styleFiles(root, config) : []
  const scan = sfiles.some((f) =>
    readFileSync(join(root, f), 'utf8').includes('@kerf-js/core/style'),
  )
    ? style.scanProject(root, sfiles, (...a) => compiler.transform(...a))
    : null

  const { files, posByAbs } = compileFiles(root, rels, compiler, scan, style)

  projectView(files, (file) => posByAbs.get(file.abs))

  const matrix = scan && style.buildMatrix(scan.groups, scan.uses)
  if (matrix && scan.groups.length) writeMatrixFile(root, matrix)
  const styles = [
    ...(usesTailwind(root) ? [] : classSoup(files.filter((f) => /\.[jt]sx$/.test(f.rel)))),
    ...(matrix ? matrixDiagnostics(root, matrix) : []),
  ]

  const diagnostics = await collectDiagnostics({
    root,
    loaded,
    config,
    files,
    exclude,
    styles,
    testRels,
    options,
    given,
  })
  const summary = { files: files.length, tests: testRels.length, ...summarize(diagnostics) }
  return {
    version: 1,
    ok: summary.errors === 0,
    root,
    kerf: { version: kerf.version, from: kerf.from, compiler: kerf.compilerPath },
    config: loaded.file ? posix(relative(root, loaded.file)) : null,
    summary,
    diagnostics,
    slots: loaded.slots,
    styles: matrix
      ? { groups: Object.keys(matrix.groups).length, matrix: '.kerf/styles.json' }
      : null,
    files: rels,
    tests: testRels,
    ms: Math.round(performance.now() - started),
  }
}
