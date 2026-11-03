// Every dependency's licence, read from the lockfiles, against the list of licences this repo accepts. Rust's are in deny.toml.
//
//   node scripts/quality/licences.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const ALLOWED = new Set(['MIT', 'MIT-0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Python-2.0', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0', 'BlueOak-1.0.0', 'MPL-2.0', 'OFL-1.1', 'Zlib', 'WTFPL'])
/** Reviewed by hand. Each entry says why it's fine; the check matches `name` and nothing about the version. */
export const REVIEWED = [
  [/^@img\/sharp-/, 'LGPL libvips: a prebuilt library sharp loads at run time and an install can replace. sharp is optional and nothing of it is copied into weft.'],
  [/^elkjs$/, 'EPL-2.0: a dev-only tool Prisma pulls in. It never ships.'],
  [/^limiter$/, 'MIT: its LICENSE.txt says so; the manifest uses the old `licenses` field.'],
  [/^xmlhttprequest-ssl$/, 'MIT: its LICENSE says so; the manifest uses the old `licenses` field.'],
]

const fits = expr => {
  const parts = String(expr).replace(/[()]/g, ' ').trim()
  if (/\sOR\s/i.test(parts)) return parts.split(/\s+OR\s+/i).some(fits)
  if (/\sAND\s/i.test(parts)) return parts.split(/\s+AND\s+/i).every(fits)
  return ALLOWED.has(parts.trim())
}

const locks = ['package-lock.json', 'site/package-lock.json', ...readdirSync(join(root, 'packages')).map(d => `packages/${d}/package-lock.json`)].map(f => join(root, f)).filter(existsSync)
const problems = new Set()
let seen = 0
for (const lock of locks) {
  for (const [path, entry] of Object.entries(JSON.parse(readFileSync(lock, 'utf8')).packages ?? {})) {
    if (!path || entry.link || !path.includes('node_modules/') || path.includes('@weft-js/')) continue
    seen++
    const name = path.split('node_modules/').at(-1)
    if (REVIEWED.some(([re]) => re.test(name))) continue
    if (!entry.license) problems.add(`${name}@${entry.version}: no licence in ${relative(root, lock)}`)
    else if (!fits(entry.license)) problems.add(`${name}@${entry.version}: ${entry.license} (${relative(root, lock)})`)
  }
}
for (const line of problems) console.log(line)
if (!problems.size) console.log(`${seen} entries, all on the list`)
process.exit(problems.size ? 1 : 0)
