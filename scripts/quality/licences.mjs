// Every dependency's licence, as pnpm reads it from the workspace's installed packages, against the list of licences this repo accepts. Rust's are in deny.toml.
//
//   node scripts/quality/licences.mjs
import { repoRoot } from '../lib/helpers.mjs'
import { execFileSync } from 'node:child_process'

const root = repoRoot
export const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Python-2.0',
  'Unlicense',
  'CC0-1.0',
  'CC-BY-4.0',
  'BlueOak-1.0.0',
  'MPL-2.0',
  'OFL-1.1',
  'Zlib',
  'WTFPL',
])
/** Reviewed by hand. Each entry says why it's fine; the check matches `name` and nothing about the version. */
export const REVIEWED = [
  [
    /^@img\/sharp-/,
    'LGPL libvips: a prebuilt library sharp loads at run time and an install can replace. sharp is optional and nothing of it is copied into weft.',
  ],
  [/^elkjs$/, 'EPL-2.0: a dev-only tool Prisma pulls in. It never ships.'],
  [/^limiter$/, 'MIT: its LICENSE.txt says so; the manifest uses the old `licenses` field.'],
  [/^xmlhttprequest-ssl$/, 'MIT: its LICENSE says so; the manifest uses the old `licenses` field.'],
]

const fits = (expr) => {
  const parts = String(expr).replace(/[()]/g, ' ').trim()
  if (/\sOR\s/i.test(parts)) return parts.split(/\s+OR\s+/i).some(fits)
  if (/\sAND\s/i.test(parts)) return parts.split(/\s+AND\s+/i).every(fits)
  return ALLOWED.has(parts.trim())
}

// WEFT_LICENCES_JSON: a `pnpm licenses list --json` result to read instead (prove.mjs plants a bad one this way)
const listed = JSON.parse(
  process.env.WEFT_LICENCES_JSON ??
    execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['licenses', 'list', '--json', '--recursive'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, shell: process.platform === 'win32' },
    ),
)
const problems = new Set()
let seen = 0
for (const [license, entries] of Object.entries(listed)) {
  for (const { name, versions } of entries) {
    if (name.startsWith('@weft-js/')) continue
    seen++
    if (REVIEWED.some(([re]) => re.test(name))) continue
    if (!license || license === 'Unknown') problems.add(`${name}@${versions.join(',')}: no licence`)
    else if (!fits(license)) problems.add(`${name}@${versions.join(',')}: ${license}`)
  }
}
for (const line of problems) console.log(line)
if (!problems.size) console.log(`${seen} entries, all on the list`)
process.exit(problems.size ? 1 : 0)
