import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { database } from '../map.mjs'
import { dbLayer } from '../db-layer.mjs'
import { refused } from './errors.mjs'

/** The plugin's `setup`, once the package is installed: a plain import, since the package can't run anything by being read. */
export async function setupOf(root, pkg) {
  let path
  try {
    path = createRequire(join(root, 'package.json')).resolve(`${pkg}/plugin`)
  } catch {
    return undefined // no plugin entry, or a dry run before the install
  }
  const mod = await import(pathToFileURL(path).href)
  const make = mod.default ?? Object.values(mod).find((v) => typeof v === 'function')
  return make?.().contribute({ command: 'check', mode: 'development', root }).setup
}

/** What `setup` wants, checked in full before anything is written, so a refusal changes nothing. */
export async function planSetup(root, setup) {
  const layer = await dbLayer(root)
  if (setup.needs?.includes('db') && !layer)
    throw refused('This needs a database: run `weft add db` first. Nothing was changed.')
  if (setup.needs?.includes('auth') && !existsSync(join(root, 'src/auth.server.ts')))
    throw refused('This needs users: run `weft add auth` first. Nothing was changed.')
  const read = (rel) =>
    existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : undefined
  let plan
  try {
    plan = setup.run({
      engine: layer ? database(root, layer).engine : null,
      layer: layer?.layer ?? null,
      read,
    })
  } catch (error) {
    throw refused(`${error.message}. Nothing was changed.`)
  }
  const taken = Object.keys(plan.files ?? {}).filter((f) => existsSync(join(root, f)))
  if (taken.length) throw refused(`${taken.join(', ')} already exist. Nothing was changed.`)
  return plan
}

export function applySetup(root, plan) {
  for (const [file, text] of Object.entries({ ...plan.files, ...plan.edits })) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  for (const name of ['.env', '.env.example']) {
    const file = join(root, name)
    const had = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const lines = Object.entries(plan.env ?? {})
      .filter(([k]) => !had.includes(`${k}=`))
      .map(([k, v]) => `${k}=${v}\n`)
    if (lines.length) writeFileSync(file, `${had && `${had.trimEnd()}\n`}${lines.join('')}`)
  }
}

export const setupActions = (plan) => [
  ...Object.keys({ ...plan.files, ...plan.edits }).map((f) => `write ${f}`),
  ...(plan.env ? [`add ${Object.keys(plan.env).join(', ')} to .env and .env.example`] : []),
  ...(plan.next ?? []).map((n) => `next: ${n}`),
]

export function authEdits({ root, files, context, tables, envText, layer }) {
  const edits = { ...files, 'src/context.server.ts': context }
  if (!envText.includes('BETTER_AUTH_SECRET'))
    edits['src/env.server.ts'] = envText.replace(
      'server: {\n',
      'server: {\n    BETTER_AUTH_SECRET: z.string().min(32),\n',
    )
  if (layer.layer === 'drizzle') {
    edits['src/db/auth.schema.ts'] = tables
    edits['src/db/schema.ts'] =
      `${readFileSync(join(root, 'src/db/schema.ts'), 'utf8').trimEnd()}\n\nexport * from './auth.schema'\n`
  } else if (layer.layer === 'prisma') {
    edits['prisma/schema.prisma'] =
      `${readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').trimEnd()}\n${tables}`
  } else {
    const next = existsSync(join(root, 'migrations'))
      ? readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).length
      : 0
    edits[`migrations/${String(next).padStart(4, '0')}_auth.sql`] = tables
  }
  return edits
}
