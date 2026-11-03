// `weft map`: a matrix of what to call in this app, generated from its config and code (research 34 §8). It runs on every
// `weft check`, so it reads files and never starts Vite. Rows point at where an answer lives instead of copying it, and
// a system the app doesn't have gets no row.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { discover } from './files.mjs'
import { loadConfig } from './load-config.mjs'
import { dbLayer } from './db-layer.mjs'
import { listSurfaces } from './surface-checks.mjs'

const read = (root, rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '')
const names = (text, re) => [...text.matchAll(re)].map(m => m[1])
/** Up to `max` names: enough to recognise the app, while the row's call gives the whole list. */
const sample = (list, max = 6) => (list.length > max ? `${list.slice(0, max).join(', ')}, +${list.length - max}` : list.join(', '))

function serverFunctions(root) {
  const files = discover(root, { include: ['src/server/**/*.{ts,mts}', 'src/**/*.server.{ts,mts}'], exclude: [] })
  const out = { functions: [], channels: [] }
  for (const rel of files) {
    const found = [...read(root, rel).matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(query|mutation|stream|channel)\s*\(/g)]
    const fns = found.filter(m => m[2] !== 'channel').map(m => m[1])
    if (fns.length) out.functions.push(`\`${rel}\`: ${fns.join(', ')}`)
    out.channels.push(...found.filter(m => m[2] === 'channel').map(m => m[1]))
  }
  return out
}

const sqlText = (root, dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(f => f.endsWith('.sql')).map(f => read(root, join(dir, f))).join('\n') : '')
const ENGINE = { PrismaLibSql: 'sqlite', PrismaPg: 'postgres', PrismaMariaDb: 'mysql' }

export function database(root, layer) {
  if (!layer) return null
  const entry = read(root, 'src/db/index.server.ts')
  const engine = entry.match(/@weft-js\/(?:start\/db|db\/plugin-native)\/(\w+)/)?.[1] ?? ENGINE[entry.match(/Prisma(?:LibSql|Pg|MariaDb)/)?.[0]] ?? 'unknown'
  const tables = layer.layer === 'prisma' ? names(read(root, layer.schema), /^model\s+(\w+)/gm)
    : layer.layer === 'native' ? names(sqlText(root, layer.migrations), /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(\w+)/gi)
      : names(read(root, 'src/db/schema.ts'), /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*\w+Table\s*\(/g)
  return { engine, layer: layer.layer, tables }
}

function routes(root) {
  const files = discover(root, { include: ['src/routes/**/*.{ts,tsx}'], exclude: [] })
  return files.map(f => f.replace(/^src\/routes\//, '').replace(/\.[jt]sx?$/, '')).filter(f => !/(^|\/)_/.test(f))
}

/** The map as data. */
export async function agentMap(root) {
  root = resolve(root)
  const loaded = await loadConfig(root)
  const { config } = loaded
  const pages = routes(root)
  const fns = serverFunctions(root)
  const env = ['src/env.ts', 'src/env.server.ts'].find(f => existsSync(join(root, f)))
  const layer = await dbLayer(root, loaded)
  const db = database(root, layer)
  const authFile = read(root, 'src/auth.server.ts')
  const auth = authFile && (authFile.includes('better-auth') ? 'better-auth' : 'custom')
  const surfaces = listSurfaces(root).map(s => s.name)
  const styled = existsSync(join(root, '.weft/styles.json')) ? Object.keys(JSON.parse(read(root, '.weft/styles.json')).groups ?? {}) : []
  const bound = Object.entries(loaded.slots ?? {}).filter(([, v]) => typeof v === 'string' && !v.startsWith('weft:default')).map(([slot]) => slot)
  const tasks = Object.keys(config.tasks ?? {})
  const row = (want, call, have) => ({ want, call, ...(have && { have }) })

  const rows = [
    pages.length && row('Pages, their data and metadata', '`weft routes --meta`', sample(pages)),
    fns.functions.length && row('Server functions', 'The file named here; signatures in `.weft/contract.json` after a build', fns.functions.join('; ')),
    fns.channels.length && row('Channels', '`weft docs start`', sample(fns.channels)),
    db && row('Tables and migrations', layer.schema ? `\`${layer.schema}\`, then \`weft db generate\`` : `\`weft db generate <name>\`, then SQL in \`${layer.migrations}/\``, sample(db.tables)),
    auth && row('Who the user is', '`ctx.user` on the server; `src/auth.server.ts`', auth),
    row('Styles', 'Before writing one: `weft style find <what it is>`', styled.length ? sample(styled) : undefined),
    env && row('Environment variables', `\`${env}\`; values in \`.env\``),
    surfaces.length && row('Canvas and WebGL', '`weft surfaces`', sample(surfaces)),
    ...loaded.contributions.flatMap(c => c.manifest.map ?? []).map(r => row(r.want, r.call, r.have)),
    (config.plugins?.length || bound.length) && row('Plugins and slots', '`weft plugins`, `weft plugins explain <slot>`', sample(bound)),
    tasks.length && row('Project tasks', '`weft tasks --json`', sample(tasks)),
    row('A rule or a diagnostic', '`weft docs <topic or code>`'),
    row('The running app', '`weft browser snapshot`'),
  ].filter(Boolean)

  return { version: 1, app: config.site?.name ?? null, stack: { runtime: config.runtime ?? 'node', ui: config.plugins?.map(p => p.name) ?? [], db, auth: auth || null }, rows }
}

export function formatMap(map) {
  const { stack } = map
  const parts = [`runtime ${stack.runtime}`, stack.db && `${stack.db.layer} on ${stack.db.engine}`, stack.auth, ...stack.ui].filter(Boolean)
  const table = map.rows.map(r => `| ${r.want} | ${r.call} | ${r.have ?? ''} |`)
  return [
    `# ${map.app ?? 'This app'}: agent map`,
    '',
    '<!-- Generated by `weft map` from this app\'s config and code. Do not edit. -->',
    '',
    `Stack: ${parts.join(', ')}.`,
    '',
    '| To find or do | Call | In this app |',
    '|---|---|---|',
    ...table,
    '',
  ].join('\n')
}

/** Write `.weft/map.md` and `.weft/map.json`. */
export async function writeMap(root) {
  root = resolve(root)
  const map = await agentMap(root)
  mkdirSync(join(root, '.weft'), { recursive: true })
  writeFileSync(join(root, '.weft/map.md'), formatMap(map))
  writeFileSync(join(root, '.weft/map.json'), `${JSON.stringify(map, null, 2)}\n`)
  return map
}
