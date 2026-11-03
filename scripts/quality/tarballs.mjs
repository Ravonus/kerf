// Nothing private goes out in a package, and nothing private can be committed by accident.
//
//   node scripts/quality/tarballs.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../jobs.mjs'
import { strayReason } from './stray.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const MUST_IGNORE = ['.env', '.env.local', '.env.production', 'site/.env', 'packages/start/.env', 'netlify.env', '.neon', '.mcp.json', 'site/netlify.env', 'site/.neon', 'server.pem', 'server.key', 'secrets.p12', '.npmrc']
const problems = []

for (const file of MUST_IGNORE) if (spawnSync('git', ['check-ignore', '-q', '--no-index', file], { cwd: root }).status !== 0) problems.push(`.gitignore doesn't keep out ${file}`)

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')
for (const file of tracked) if (/(^|\/)(\.env(\.(?!example$)[^/]*)?|netlify\.env|\.neon|\.mcp\.json|\.npmrc)$|\.(pem|p12)$/.test(file)) problems.push(`${file} is committed and looks private`)

const dirs = readdirSync(join(root, 'packages')).filter(d => existsSync(join(root, 'packages', d, 'package.json')) && !JSON.parse(readFileSync(join(root, 'packages', d, 'package.json'), 'utf8')).private)
await pool(dirs, 4, dir => new Promise(ok => {
  // Asked of npm, not of the file list: that's what would be sent. No scripts, so nothing is built to answer.
  const r = spawnSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: join(root, 'packages', dir), encoding: 'utf8', maxBuffer: 1 << 28, shell: process.platform === 'win32' })
  if (r.status !== 0) problems.push(`npm pack failed in packages/${dir}: ${r.stderr.slice(-300)}`)
  else for (const { path } of JSON.parse(r.stdout)[0].files) { const why = strayReason(path); if (why) problems.push(`packages/${dir} would ship ${path}: ${why}`) }
  ok()
}))

for (const line of problems) console.log(line)
process.exit(problems.length ? 1 : 0)
