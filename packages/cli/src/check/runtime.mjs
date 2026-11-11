import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate } from '../diag.mjs'
import { start } from '../start.mjs'

const posix = (p) => p.split('\\').join('/')

/**
 * R101, R102 from the contract, and R103, R109 from `cargo check`, for an app with a sidecar: an agent gets the same
 * answer here as from `kerf build`, with the function's id on it.
 */
export async function rustChecks(root, loaded) {
  let sidecar
  try {
    sidecar = await start(root, 'sidecar')
  } catch {
    return []
  }
  if (!sidecar.usesRemote(root)) return []
  const rust = loaded.config?.rust
  const held = process.env.KERF_BUILD
  process.env.KERF_BUILD = '1'
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
      .map((d) => diagnostic({ ...d, file: '.kerf/contract.json' }))
    if (out.some((d) => d.severity === 'error')) return out
    for (const service of Object.keys(contract.services ?? {})) {
      if (rust?.services?.[service]?.external) continue
      const dir = sidecar.crateDir(root, rust, service)
      if (!existsSync(dir)) {
        out.push(
          diagnostic({
            code: 'R109',
            file: '.kerf/contract.json',
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
        file: '.kerf/contract.json',
        why: `the contract couldn't be written, so the sidecars weren't checked: ${e.message.split('\n')[0]}`,
      }),
    ]
  } finally {
    if (held === undefined) delete process.env.KERF_BUILD
    else process.env.KERF_BUILD = held
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
export async function liveChecks(root, loaded, preset) {
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
  const held = process.env.KERF_BUILD
  process.env.KERF_BUILD = '1'
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
    if (held === undefined) delete process.env.KERF_BUILD
    else process.env.KERF_BUILD = held
  }
}

/** R001 for a server module's `channel`, and R004 for a socket handler of the app's own (research 32 §1). */
export async function socketChecks(root) {
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
            pathToFileURL(createRequire(join(root, 'package.json')).resolve('@kerf/start/vite'))
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

/** kerf owns the connection: these bypass reconnects, resume and the fake transport (research 30 §8). */
const SOCKET_PACKAGES = [
  'ws',
  'socket.io-client',
  'reconnecting-websocket',
  '@microsoft/fetch-event-source',
]

/** P002 (`package.json` scripts that aren't `kerf …`), P120 (kerf plugins wired straight into Vite), R007 (socket libraries). */
export function hygiene(root) {
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
            why: `\`${name}\` is a dependency: its connection has no resume, no cleanup and no fake in @kerf/core/test. Use \`stream\`, \`.live()\` or \`channel\`.`,
          }),
        )
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/^kerf(\s|$)/.test(cmd.trim())) {
        out.push(
          diagnostic({
            code: 'P002',
            file: 'package.json',
            ...locate(text, `"${name}"`),
            why: `Script \`${name}\` runs \`${cmd}\`, not \`kerf …\`: agents can't see what it does or what it touches.`,
          }),
        )
      }
    }
  }
  for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/from\s+['"](@kerf\/(?:plugin-[\w-]+|text))/g)) {
      out.push(
        diagnostic({
          code: 'P120',
          file: name,
          ...locate(text, m[1]),
          why: `\`${m[1]}\` is registered in ${name}, which bypasses kerf.config.ts.`,
        }),
      )
    }
  }
  return out
}
