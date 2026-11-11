// What a deploy target can do for live data, from its preset and config alone: `weft check`, `weft build` and `weft
// doctor` read this. What only a running server can know (a pooler, a missing trigger) the server probes at startup.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const LISTENER =
  "run `weft db listen` on any always-on host (a VPS, Fly, Railway), publishing into a shared bus, and set `dbChanges(db, tables, { listener: 'external' })`"
const SERVER =
  'deploy to a server preset (`node_server`, `bun`, `deno_server`, or a container on Fly, Railway or Render)'
const POLLED = 'or poll the query yourself by reloading: `.live()` still updates on mutations'

/** Presets that give each request its own short-lived process. */
const FUNCTIONS = [
  [/^vercel/, 'Vercel Functions'],
  [/^netlify/, 'Netlify Functions'],
  [/^aws[-_]lambda/, 'AWS Lambda'],
  [/^azure/, 'Azure Functions'],
  [/^firebase/, 'Firebase Functions'],
  [/^cloudflare/, 'Cloudflare Workers'],
  [/^deno[-_]deploy/, 'Deno Deploy'],
]

/**
 * @param {string} [preset]
 * @returns {{ preset: string, held: boolean, host: string }} `held`: one process outlives a request, so it can hold a connection and a timer
 */
export function liveTarget(preset = 'node') {
  const hit = FUNCTIONS.find(([re]) => re.test(preset))
  return hit
    ? { preset, held: false, host: hit[1] }
    : { preset, held: true, host: 'a long-running server' }
}

/** Whether a deploy can hold a browser's socket: a long-running server, a Durable Object, or Deno's upgraded request. */
export const holdsSockets = (preset = 'node') =>
  liveTarget(preset).held || /^(cloudflare[-_]durable|deno[-_]deploy)/.test(preset)

/**
 * Whether the page dials a socket (`__WEFT_SOCKETS__`): only when the server answers one, an app with a channel or
 * shared state (`sockets`) on a host that can hold it. A socket nobody serves never fails, so a page that dialed one
 * would wait on it for good; without one, streams and live queries go straight to SSE.
 * @param {{ sockets: boolean, build: boolean, preset?: string }} app
 */
export const pageSockets = ({ sockets, build, preset }) =>
  sockets && (!build || holdsSockets(preset))

const SKIP = new Set(['node_modules', '.weft', '.output', 'dist'])

/** `live: { required: true }` on a query, and `.live(input, { required: true })` in a component, with where. */
export function scanRequired(root) {
  const out = []
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, d.name)
      if (d.isDirectory()) {
        if (!SKIP.has(d.name)) walk(f)
      } else if (/\.[cm]?[jt]sx?$/.test(d.name) && !/\.test\./.test(d.name)) read(f)
    }
  }
  const read = (file) => {
    const text = readFileSync(file, 'utf8')
    if (!/required:\s*true/.test(text)) return
    for (const m of text.matchAll(/\blive:\s*\{[^}]*required:\s*true/g)) {
      const name = [...text.slice(0, m.index).matchAll(/\b(\w+)\s*=\s*query\s*[(<]/g)].at(-1)?.[1]
      if (name) out.push({ name, file: file.slice(root.length + 1) })
    }
    for (const m of text.matchAll(/\b(\w+)\.live\(([^;\n]*?)\brequired:\s*true/g))
      out.push({ name: m[1], file: file.slice(root.length + 1) })
  }
  const src = join(root, 'src')
  if (existsSync(src)) walk(src)
  return [...new Map(out.map((r) => [r.name, r])).values()]
}

/**
 * What this deploy gets, for `weft doctor`, and the diagnostics `weft check` and `weft build` report.
 * @param {{ preset?: string, source?: { name: string, external?: boolean, tables: string[] }, required?: { name: string, file: string }[] }} input
 */
export function livePlan({ preset, source, required = [] }) {
  const target = liveTarget(preset)
  const names = required.map((r) => `\`${r.name}\``).join(', ')
  const diagnostics = []
  const options = target.held ? [] : [LISTENER, SERVER]
  let mode, says
  if (!source) {
    mode = 'app'
    says =
      'Mutations update `.live()` queries. Writes from outside the app do not: nothing listens to the database.'
    if (required.length)
      diagnostics.push({
        code: 'R013',
        severity: 'error',
        why: `${names} require${required.length > 1 ? '' : 's'} a live feed, and \`src/realtime.server.ts\` sets no \`changes\`. Add \`changes: dbChanges(db, [tables])\`, or drop \`required\`.`,
      })
  } else if (source.external) {
    mode = 'external'
    says = `A separate listener reports writes to ${source.tables.join(', ')} through the bus. It is yours to keep running; \`.live()\` shows \`reconnecting\` when it goes quiet.`
  } else if (target.held) {
    mode = 'feed'
    says = `This server listens to ${source.name} for writes to ${source.tables.join(', ')}. At startup it probes what the database allows, and logs what it settled on.`
  } else {
    mode = 'off'
    says = `${target.host} ends a process with its request, so nothing can hold a connection to ${source.name}: mutations update \`.live()\`, and writes from outside the app do not. \`.live()\` shows \`degraded\`.`
    if (required.length)
      diagnostics.push({
        code: 'R013',
        severity: 'error',
        why: `${names} require${required.length > 1 ? '' : 's'} a live feed, and \`${target.preset}\` can't hold one: ${target.host} ends a process with its request. Either ${LISTENER}, or ${SERVER}, or drop \`required\`.`,
      })
    else
      diagnostics.push({
        code: 'R014',
        severity: 'warning',
        why: `\`changes\` needs a process that stays up, and on \`${target.preset}\` none does: writes from outside the app won't reach \`.live()\`. Either ${LISTENER}, or ${SERVER}, ${POLLED}.`,
      })
  }
  return {
    preset: target.preset,
    held: target.held,
    host: target.host,
    mode,
    says,
    required: required.map((r) => r.name),
    options,
    diagnostics,
  }
}

// ---- `verify` ---------------------------------------------------------------------------------------------------------

const PRODUCTION = /(^|[.\-_])(prod|production|live|www|main|master)([.\-_]|$)/i
const NOT_PRODUCTION =
  /(^|[.\-_])(staging|stage|stg|dev|develop|development|test|testing|qa|sandbox|preview|uat|demo)([.\-_]|$)|^localhost$|^127\.|^\[?::1\]?$/i

const hostOf = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
const dbNameOf = (url) => {
  try {
    return new URL(url).pathname.slice(1)
  } catch {
    return ''
  }
}

const HOWTO =
  'Set `WEFT_STAGING_URL` to a running staging app, `STAGING_DATABASE_URL` to its database, or both for the whole chain.'

/**
 * Where a `verify` points, from the query's declaration, `live.targets` in weft.config.ts and the environment.
 * @returns {{ name: string, url?: string, db?: string, marked: boolean } | { missing: string }}
 */
export function resolveTarget(verify, { targets = {}, env = process.env } = {}) {
  if (typeof verify === 'object' && verify.target !== undefined)
    return resolveTarget(verify.target, { targets, env })
  if (verify === true) {
    const url = env.WEFT_STAGING_URL,
      db = env.STAGING_DATABASE_URL
    return url || db
      ? { name: 'staging', url, db, marked: false }
      : {
          missing: `\`verify: true\` found neither \`WEFT_STAGING_URL\` nor \`STAGING_DATABASE_URL\`. ${HOWTO}`,
        }
  }
  if (typeof verify === 'string') {
    const t = targets[verify]
    if (!t)
      return {
        missing: `\`verify: '${verify}'\` names no target. Add it to weft.config.ts: \`live: { targets: { ${verify}: { url: 'https://…', db: 'STAGING_DATABASE_URL', production: false } } }\``,
      }
    const db = t.db && (t.db.includes('://') ? t.db : env[t.db])
    if (t.db && !db)
      return {
        missing: `target \`${verify}\` reads its database from \`${t.db}\`, which isn't set on this machine.`,
      }
    return { name: verify, url: t.url, db, marked: t.production === false }
  }
  if (!verify.url && !verify.db)
    return { missing: `\`verify\` got an empty target (is its env var set?). ${HOWTO}` }
  return { name: 'inline', url: verify.url, db: verify.db, marked: false }
}

/** Why this target must not be touched: R022. Anything that says production is refused, whatever config says. */
export function refusal(target, { targets = {} } = {}) {
  const hosts = [target.url && hostOf(target.url), target.db && hostOf(target.db)].filter(Boolean)
  const names = [target.name, ...hosts, ...(target.db ? [dbNameOf(target.db)] : [])]
  const said = names.find((n) => PRODUCTION.test(n))
  if (said) return `\`${said}\` looks like production: \`verify\` writes rows, and won't go near it`
  if (
    target.name !== 'inline' &&
    target.name !== 'staging' &&
    targets[target.name]?.production !== false
  )
    return `target \`${target.name}\` isn't marked: add \`production: false\` to it in weft.config.ts`
  if (target.marked) return
  const unsure = hosts.find((h) => !NOT_PRODUCTION.test(h))
  if (unsure)
    return `nothing says \`${unsure}\` isn't production. Name it in weft.config.ts: \`live: { targets: { staging: { db: 'STAGING_DATABASE_URL', production: false } } }\`, and use \`verify: 'staging'\``
}

const PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[^\s'"`/:@]+:[^\s'"`/@]+@/i

/** R020: a connection string with a password, written into source. An env var's value never reaches this. */
export function literalSecrets(root) {
  const out = []
  const look = (file) => {
    const text = readFileSync(file, 'utf8')
    if (!/\b(verify|targets)\b/.test(text)) return
    text.split('\n').forEach((line, i) => {
      if (PASSWORD.test(line) && /\b(db|url|verify)\b/.test(line))
        out.push({ file: file.slice(root.length + 1), line: i + 1 })
    })
  }
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, d.name)
      if (d.isDirectory()) {
        if (!SKIP.has(d.name)) walk(f)
      } else if (/\.[cm]?[jt]sx?$/.test(d.name)) look(f)
    }
  }
  if (existsSync(join(root, 'src'))) walk(join(root, 'src'))
  for (const f of ['weft.config.ts', 'weft.config.js', 'weft.config.mjs'])
    if (existsSync(join(root, f))) look(join(root, f))
  return out
}
