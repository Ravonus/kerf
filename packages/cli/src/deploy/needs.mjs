// What an app needs from a host (research 46 §2), read from its files in one pass: no Vite server, no build. Each need
// carries the file that shows it, so a diagnostic can point there.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP = new Set(['node_modules', '.weft', '.output', 'dist', '.netlify', '.vercel'])
/** npm packages with a compiled addon: one built on a Mac doesn't load on a Linux function. */
const ADDONS = /^(better-sqlite3|sqlite3|sharp|bcrypt|argon2|canvas|@node-rs\/.+|@napi-rs\/canvas|bufferutil|utf-8-validate)$/
/** A bus that reaches every instance. The memory bus is what's left when none is named. */
const BUSES = /\b(postgresBus|redisBus|natsBus|durableObjectBus)\s*\(|@weft-js\/realtime-(redis|nats|durable-object)/

const posix = p => p.replaceAll('\\', '/')

function sources(root) {
  const out = []
  const walk = dir => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, d.name)
      if (d.isDirectory()) { if (!SKIP.has(d.name)) walk(f) } else if (/\.[cm]?[jt]sx?$/.test(d.name) && !/\.(test|spec)\.|\.d\.ts$/.test(d.name)) out.push(f)
    }
  }
  if (existsSync(join(root, 'src'))) walk(join(root, 'src'))
  return out
}

/** `.weft/contract.json`, when it's newer than every source file: what the last build saw is then what's there. */
function freshContract(root, files) {
  const file = join(root, '.weft', 'contract.json')
  if (!existsSync(file)) return
  const at = statSync(file).mtimeMs
  if (files.some(f => statSync(f).mtimeMs > at)) return
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch {}
}

const read = file => { try { return readFileSync(file, 'utf8') } catch { return '' } }

/**
 * @param {string} root
 * @param {any} [config] the loaded weft.config
 * @returns {{ sockets?: Need, required?: Need, feed?: Need, memoryBus?: Need, sidecar?: Need, native?: Need, sqlite?: Need, uploads?: Need, addons?: Need, runtime: string }}
 * @typedef {{ file: string, what: string }} Need
 */
export function needsOf(root, config = {}) {
  const files = sources(root)
  const rel = f => posix(relative(root, f))
  const needs = { runtime: config.runtime ?? 'node' }
  const contract = freshContract(root, files)
  const realtimeFile = join(root, 'src/realtime.server.ts')
  const realtime = read(realtimeFile)
  let streams = false
  if (contract) {
    const live = contract.functions?.find(f => f.kind === 'channel' || f.kind === 'shared')
    if (live) needs.sockets = { file: '.weft/contract.json', what: `\`${live.name}\` is a ${live.kind === 'shared' ? '`sharedState`' : '`channel`'}` }
    streams = contract.functions?.some(f => ['stream', 'channel', 'shared'].includes(f.kind))
    const native = Object.entries(contract.services ?? {}).find(([, s]) => s.kind === 'native')
    if (native) needs.native = { file: '.weft/contract.json', what: `\`native('${native[0]}')\`` }
  }
  for (const f of files) {
    const text = read(f)
    const server = /^src\/server\/|\.server\.[cm]?[jt]sx?$/.test(rel(f))
    if (!contract && server) {
      const m = /\b(channel|sharedState)\s*[(<]/.exec(text)
      if (m && !needs.sockets) needs.sockets = { file: rel(f), what: `a \`${m[1]}\`` }
      if (/\b(stream|channel|sharedState)\s*[(<]/.test(text)) streams = true
    }
    if (/\.live\(/.test(text)) streams = true
    if (/['"]@weft-js\/start\/rust['"]/.test(text)) {
      for (const m of text.matchAll(/\bremote\(\s*['"`]rust:\/\/([\w-]+)/g)) if (!config.rust?.services?.[m[1]]?.external) needs.sidecar ??= { file: rel(f), what: `\`remote('rust://${m[1]}')\`` }
      const n = /\bnative\(\s*['"`]([\w-]+)/.exec(text)
      if (n) needs.native ??= { file: rel(f), what: `\`native('${n[1]}')\`` }
    }
    if (!/listener:\s*['"]external['"]/.test(realtime) && /\.live\(([^;\n]*?)\brequired:\s*true|\blive:\s*\{[^}]*required:\s*true/.test(text)) needs.required ??= { file: rel(f), what: 'a live query marked `required`' }
    if (/\bctx\.media\b|\bz\.media\b/.test(text)) needs.uploads ??= { file: rel(f), what: 'media uploads' }
  }
  if (!needs.sockets && /\bshare\s*[:,}]/.test(realtime)) needs.sockets = { file: 'src/realtime.server.ts', what: '`realtime({ share })`' }
  if (/\bchanges\s*[:,}]/.test(realtime) && !/listener:\s*['"]external['"]/.test(realtime)) needs.feed = { file: 'src/realtime.server.ts', what: '`changes`' }
  const plugins = (config.plugins ?? []).map(p => p?.name ?? p).filter(n => typeof n === 'string')
  const configText = ['weft.config.ts', 'weft.config.mts', 'weft.config.js', 'weft.config.mjs'].map(n => read(join(root, n))).join('\n')
  if ((streams || needs.sockets) && !BUSES.test(realtime) && !plugins.some(n => /realtime-(redis|nats|durable-object)/.test(n)) && !BUSES.test(configText)) needs.memoryBus = { file: existsSync(realtimeFile) ? 'src/realtime.server.ts' : 'src', what: 'the memory bus' }
  if (!needs.uploads && /encoder:\s*['"]server['"]/.test(configText)) needs.uploads = { file: 'weft.config.ts', what: "`media({ encoder: 'server' })`" }
  if (needs.uploads && !plugins.some(n => n.includes('plugin-media')) && !configText.includes('plugin-media')) delete needs.uploads // M017 says that one
  const db = read(join(root, 'src/db/index.server.ts'))
  const drizzle = read(join(root, 'drizzle.config.ts'))
  if (/\/db\/sqlite['"]/.test(db) || (/dialect:\s*['"](sqlite|turso)['"]/.test(drizzle) && !/libsql:|turso/.test(drizzle + db))) needs.sqlite = { file: db ? 'src/db/index.server.ts' : 'drizzle.config.ts', what: 'a SQLite file' }
  try {
    const pkg = JSON.parse(read(join(root, 'package.json')) || '{}')
    const addon = Object.keys(pkg.dependencies ?? {}).find(n => ADDONS.test(n))
    if (addon) needs.addons = { file: 'package.json', what: `\`${addon}\`` }
  } catch {}
  return needs
}
