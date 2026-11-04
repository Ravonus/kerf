// The weft build of every app here, running, to click through: the last builds bench.mjs left in its work area, each on
// its own port from 5501, on a fresh copy of the bench's seeded database. Ctrl-C stops them; the databases stay until the
// next bench run resets them. Sign in with shared/pg/bench-user.json.
//   node show.mjs [--port 5501]
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { clone, dbName, ensureSeed, benchUser } from './shared/pg/env.mjs'

const work = join(process.env.BENCH_WORK ?? join(homedir(), '.cache/weft-app-bench'), 'apps')
const i = process.argv.indexOf('--port')
let port = i > 0 ? Number(process.argv[i + 1]) : 5501
const kids = []

await ensureSeed()
for (const app of ['admin', 'catalog', 'landing', 'todo', 'lemonstand']) {
  const root = join(work, app, 'weft')
  if (!existsSync(join(root, '.output/server/index.mjs'))) { console.log(`${app.padEnd(11)} not built: node bench.mjs ${app}`); continue }
  const spec = JSON.parse(readFileSync(new URL(`./${app}/app.json`, import.meta.url), 'utf8'))
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1' }
  const url = `http://localhost:${port}`
  if (spec.db) {
    const name = dbName(app, 'show')
    await clone(name)
    Object.assign(env, { DATABASE_URL: `postgres://${process.env.BENCH_PG_USER ?? userInfo().username}@127.0.0.1:5432/${name}`, BETTER_AUTH_SECRET: benchUser.authSecret, BETTER_AUTH_URL: url })
  }
  const kid = spawn(process.execPath, ['--env-file-if-exists=.env', '.output/server/index.mjs'], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] })
  kids.push(kid)
  console.log(`${app.padEnd(11)} ${url}/${spec.login ? '   sign in: ' + benchUser.email : ''}`)
  port++
}
process.on('SIGINT', () => { for (const k of kids) k.kill(); process.exit(0) })
