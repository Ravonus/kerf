// `weft check`: compile every project file in check mode, add the project view, the X-codes (text-checks.mjs), plugin
// `check` hooks, the test T-codes, the config P-codes, the style D-codes (style.mjs) and the design D-codes (design-checks.mjs), and keep `.weft/styles.json`
// current when the project has style groups.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate, positions, sortDiagnostics, summarize } from './diag.mjs'
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
import { surfaceChecks } from './surface-checks.mjs'
import { textChecks } from './text-checks.mjs'
import { loadCompiler, resolveWeft } from './weft.mjs'
import { dbLayer } from './db-layer.mjs'
import { routeDiagnostics, schemaHash, siteOf, start } from './start.mjs'
import { deployChecks } from './deploy/index.mjs'

const posix = (p) => p.split('\\').join('/')

/** Q015: the schema's hash against the one `weft db generate` recorded (research 28 §2). */
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
        ? 'The schema changed since the last `weft db generate`: the database will not match it.'
        : 'No migrations yet: the first request that reads a table fails with Q014.',
    }),
  ]
}

/** I001–I003: the walk a build does (@weft-js/warp-icons/compile), when the project has the package. */
async function iconChecks(root) {
  const require = createRequire(join(root, 'package.json'))
  let compile
  for (const from of [
    () => require.resolve('@weft-js/warp-icons/compile'),
    () => createRequire(require.resolve('@weft-js/warp')).resolve('@weft-js/warp-icons/compile'),
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

/** H010: what the last build or `weft dev` found keeps an island from waiting (`.weft/hydration.json`, @weft-js/core/hydration). */
function hydrationChecks(root) {
  const file = join(root, '.weft', 'hydration.json')
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
  if (
    !loaded.diagnostics.some((d) => d.code === 'P007') &&
    (config.plugins?.length || existsSync(join(root, '.weft', 'slots')))
  )
    sync(root, loaded)

  if (loaded.file && isDataConfig(loaded.file)) writeConfigSchema(root)
  if (existsSync(join(root, '.weft'))) await writeMap(root)

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
  const style = await styleModule(weft)
  const sfiles = style ? styleFiles(root, config) : []
  const scan = sfiles.some((f) =>
    readFileSync(join(root, f), 'utf8').includes('@weft-js/core/style'),
  )
    ? style.scanProject(root, sfiles, (...a) => compiler.transform(...a))
    : null

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

  projectView(files, (file) => posByAbs.get(file.abs))

  const matrix = scan && style.buildMatrix(scan.groups, scan.uses)
  if (matrix && scan.groups.length) writeMatrixFile(root, matrix)
  const styles = [
    ...(usesTailwind(root) ? [] : classSoup(files.filter((f) => /\.[jt]sx$/.test(f.rel)))),
    ...(matrix ? matrixDiagnostics(root, matrix) : []),
  ]

  const fontBuild =
    typeof loaded.slots['font.build'] === 'string' &&
    !loaded.slots['font.build'].startsWith('weft:default')
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
    styles: matrix
      ? { groups: Object.keys(matrix.groups).length, matrix: '.weft/styles.json' }
      : null,
    files: rels,
    tests: testRels,
    ms: Math.round(performance.now() - started),
  }
}

/**
 * R101, R102 from the contract, and R103, R109 from `cargo check`, for an app with a sidecar: an agent gets the same
 * answer here as from `weft build`, with the function's id on it.
 */
async function rustChecks(root, loaded) {
  let sidecar
  try {
    sidecar = await start(root, 'sidecar')
  } catch {
    return []
  }
  if (!sidecar.usesRemote(root)) return []
  const rust = loaded.config?.rust
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  try {
    const { writeContract } = await start(root, 'contract')
    const preset = { node: 'node', bun: 'bun', deno: 'deno_server' }[
      loaded.config?.runtime ?? 'node'
    ]
    const { contract, diagnostics } = await writeContract({
      root,
      site: loaded.config?.site,
      rust,
      preset,
    })
    const out = diagnostics
      .filter((d) => d.code.startsWith('R1'))
      .map((d) => diagnostic({ ...d, file: '.weft/contract.json' }))
    if (out.some((d) => d.severity === 'error')) return out
    for (const service of Object.keys(contract.services ?? {})) {
      if (rust?.services?.[service]?.external) continue
      const dir = sidecar.crateDir(root, rust, service)
      if (!existsSync(dir)) {
        out.push(
          diagnostic({
            code: 'R109',
            file: '.weft/contract.json',
            why: `\`rust://${service}\` has no crate at \`${posix(relative(root, dir))}\`.`,
          }),
        )
        continue
      }
      const checked = await sidecar.cargo('check', { root, dir, service, contract })
      out.push(
        ...checked.diagnostics.map(({ rendered, ...d }) => diagnostic({ ...d, help: rendered })),
      )
      out.push(...untouchedQueries(root, dir, contract, service))
      if (contract.services[service].kind !== 'native' || !checked.ok) continue
      const wasm = await sidecar.checkWasm({ root, dir, service, contract, preset, rust })
      out.push(...wasm.diagnostics.map((d) => diagnostic(d)))
    }
    return out
  } catch (e) {
    return [
      diagnostic({
        code: 'R109',
        severity: 'warning',
        file: '.weft/contract.json',
        why: `the contract couldn't be written, so the sidecars weren't checked: ${e.message.split('\n')[0]}`,
      }),
    ]
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
}

/** R105 before anything runs: a cached query with tags whose Rust never mentions `touch`, or hands `ctx` to anything. */
function untouchedQueries(root, dir, contract, service) {
  const sources = readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.rs'))
    .map((f) => join(f.parentPath, f.name))
  const out = []
  for (const f of contract.functions) {
    if (f.impl?.service !== service || !f.cache || !(f.tags === 'dynamic' || f.tags?.length))
      continue
    const method = f.name.replace(/[A-Z]/g, (c, i) => `${i ? '_' : ''}${c.toLowerCase()}`)
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      const at = text.search(new RegExp(`\\bfn\\s+${method}\\s*\\(`))
      if (at < 0) continue
      const open = text.indexOf('{', at)
      let depth = 0,
        end = open
      for (; end < text.length; end++) {
        if (text[end] === '{') depth++
        if (text[end] === '}' && --depth === 0) break
      }
      const body = text.slice(open, end)
      const line = text.slice(0, at).split('\n').length
      if (!/\.touch\(|\(\s*&?ctx\b|,\s*&?ctx\b/.test(body))
        out.push(
          diagnostic({
            code: 'R105',
            severity: 'warning',
            file: posix(relative(root, file)),
            span: [line, 1, line, 1],
            why: `\`${f.id}\` is cached under tags and reports no table: nothing can tell whether they cover what it reads. Call \`ctx.touch("table")\`, or drop \`tags\` if it reads none.`,
          }),
        )
      break
    }
  }
  return out
}

/** R013, R014 and R018: what the deploy target does to live data. Only an app with `changes` or `required` loads anything. */
async function liveChecks(root, loaded, preset) {
  const file = join(root, 'src/realtime.server.ts')
  let target
  try {
    target = await start(root, 'live-target')
  } catch {
    return []
  }
  const required = target.scanRequired(root)
  if (
    !required.length &&
    !target.literalSecrets(root).length &&
    !(existsSync(file) && /\bchanges\s*[:,}]/.test(readFileSync(file, 'utf8')))
  )
    return []
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  try {
    const { readLivePlan } = await start(root, 'contract')
    const plan = await readLivePlan({
      root,
      site: loaded.config?.site,
      live: loaded.config?.live,
      preset:
        preset ??
        { node: 'node', bun: 'bun', deno: 'deno_server' }[loaded.config?.runtime ?? 'node'],
    })
    return plan.diagnostics.map((d) =>
      diagnostic({ ...d, file: d.file ?? required[0]?.file ?? 'src/realtime.server.ts' }),
    )
  } catch (e) {
    return [
      diagnostic({
        code: 'R014',
        severity: 'warning',
        file: 'src/realtime.server.ts',
        why: `the deploy target couldn't be checked: ${e.message.split('\n')[0]}`,
      }),
    ]
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
}

/** R001 for a server module's `channel`, and R004 for a socket handler of the app's own (research 32 §1). */
async function socketChecks(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return []
  const out = []
  let withIds
  for (const f of readdirSync(src, { recursive: true, withFileTypes: true })) {
    if (!f.isFile() || !/\.[cm]?[jt]sx?$/.test(f.name) || f.name.endsWith('.d.ts')) continue
    const abs = join(f.parentPath, f.name),
      rel = relative(root, abs).replaceAll('\\', '/'),
      text = readFileSync(abs, 'utf8')
    const hand = /from\s+['"]crossws|\bdefineWebSocketHandler\b/.exec(text)
    if (hand)
      out.push(
        diagnostic({
          code: 'R004',
          file: rel,
          ...locate(text, hand[0]),
          why: 'A WebSocket handler of its own skips the Origin check, `authorize`, the limits and resume. Use `channel`.',
        }),
      )
    if (
      !/\b(channel|sharedState)\s*[(<]/.test(text) ||
      !/^src\/server\/|\.server\.[cm]?[jt]sx?$/.test(rel)
    )
      continue
    if (withIds === undefined) {
      try {
        withIds = (
          await import(
            pathToFileURL(createRequire(join(root, 'package.json')).resolve('@weft-js/start/vite'))
              .href
          )
        ).withIds
      } catch {
        withIds = null
      }
    }
    try {
      withIds?.(text, abs, rel)
    } catch (e) {
      if (e.code !== 'R001') continue
      const line = +/:(\d+) /.exec(e.message)?.[1]
      out.push(
        diagnostic({
          code: 'R001',
          file: rel,
          span: [line, 1, line, 1],
          why: e.message.split('\n')[0].replace(/^R001: \S+ /, ''),
        }),
      )
    }
  }
  return out
}

/** weft owns the connection: these bypass reconnects, resume and the fake transport (research 30 §8). */
const SOCKET_PACKAGES = [
  'ws',
  'socket.io-client',
  'reconnecting-websocket',
  '@microsoft/fetch-event-source',
]

/** P002 (`package.json` scripts that aren't `weft …`), P120 (weft plugins wired straight into Vite), R007 (socket libraries). */
function hygiene(root) {
  const out = []
  const pkgFile = join(root, 'package.json')
  if (existsSync(pkgFile)) {
    const text = readFileSync(pkgFile, 'utf8')
    let scripts = {},
      deps = {}
    try {
      const pkg = JSON.parse(text)
      scripts = pkg.scripts ?? {}
      deps = pkg.dependencies ?? {}
    } catch {}
    for (const name of SOCKET_PACKAGES) {
      if (deps[name])
        out.push(
          diagnostic({
            code: 'R007',
            file: 'package.json',
            ...locate(text, `"${name}"`),
            why: `\`${name}\` is a dependency: its connection has no resume, no cleanup and no fake in @weft-js/core/test. Use \`stream\`, \`.live()\` or \`channel\`.`,
          }),
        )
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/^weft(\s|$)/.test(cmd.trim())) {
        out.push(
          diagnostic({
            code: 'P002',
            file: 'package.json',
            ...locate(text, `"${name}"`),
            why: `Script \`${name}\` runs \`${cmd}\`, not \`weft …\`: agents can't see what it does or what it touches.`,
          }),
        )
      }
    }
  }
  for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/from\s+['"](@weft-js\/(?:plugin-[\w-]+|text))/g)) {
      out.push(
        diagnostic({
          code: 'P120',
          file: name,
          ...locate(text, m[1]),
          why: `\`${m[1]}\` is registered in ${name}, which bypasses weft.config.ts.`,
        }),
      )
    }
  }
  return out
}
