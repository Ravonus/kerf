// The runtime matrix's realtime check (research 30 §10): SSE through each runtime's server, on a built app.
//
//   node packages/start/scripts/runtime-matrix.mjs <app> --e2e packages/start/scripts/e2e-realtime.mjs
//
// The app is `node packages/start/scripts/e2e-realtime.mjs prepare <dir>`: a scaffold plus test/fixtures/app's
// `src/server/feed.ts` and `/live` route. With `WEFT_RT_POSTGRES` set the build uses the postgres bus, and this file
// also proves a NOTIFY from outside the process reaches a connection.
import { spawnSync } from 'node:child_process'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect, frameId, pageCursor, rpc } from '../test/rt-client.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')

export default async function run({ url, log }) {
  const checks = []
  const check = (name, ok, detail) => {
    if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`)
    checks.push(name)
    log(`ok ${name}`)
  }
  const id = name => frameId(url, name)
  const [counter, bump, feed, post, stats] = ['counter', 'bump', 'noteFeed', 'postNote', 'rtStats'].map(id)
  const open = async () => (await fetch(`${url}/_weft/fn/${stats}`).then(r => r.json())).v.connections

  check('a page reading .live carries its cursor', /^\w+:\d+$/.test((await pageCursor(url, '/live')) ?? ''))

  const a = await connect(url, { s: [[1, 'q', counter], [2, 's', feed]] })
  const hello = await a.until('h')
  check('hello names the build and the epoch', hello.k && hello.e && hello.b, hello)
  check('a query subscription is acked with its tags', (await a.until('a'))[1][0] === 'counter')

  await rpc(url, bump)
  check('a mutation pokes its tags', (await a.until('p')).t[0] === 'counter')

  await new Promise(ok => { setTimeout(ok, 100) })
  await rpc(url, post, { text: 'one' })
  const [, cursor, first] = await a.until('m')
  check('a topic message arrives with a cursor', first.text === 'one' && cursor, first)

  a.close()
  await rpc(url, post, { text: 'two' })
  const b = await connect(url, { c: hello.c, s: [[1, 'q', counter], [2, 's', feed, undefined, cursor]] })
  check('a resume replays the missed message', (await b.until('m'))[2].text === 'two')
  check('a resume replays the missed poke', (await b.until('p')).t[0] === 'counter')

  await b.until('a') // the resumed subscription's own
  const change = await fetch(`${url}/_weft/rt`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-weft': '1' }, body: JSON.stringify({ k: (await b.until('h')).k, s: [[3, 'q', counter]] }) })
  check('a connection changes in place', change.status === 204 && (await b.until('a'))[0] === 3, change.status)

  const refused = await fetch(`${url}/_weft/rt`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-weft': '1', origin: 'http://evil.example' }, body: '{}' })
  check('another origin is refused', refused.status === 403, refused.status)

  if (process.env.WEFT_RT_POSTGRES) {
    const { default: postgres } = await import(pathToFileURL(join(repo, 'packages/start/node_modules/postgres/src/index.js')).href)
    const sql = postgres(process.env.WEFT_RT_POSTGRES, { max: 1 })
    await sql.notify('weft_bus', `=weft:poke\n${JSON.stringify({ t: ['counter'] })}`)
    await sql.end()
    check('a NOTIFY from another process reaches the client', (await b.until('p')).t[0] === 'counter')
  }

  const before = await open()
  b.close()
  for (let i = 0; i < 50 && (await open()) >= before; i++) await new Promise(ok => { setTimeout(ok, 100) })
  check('a closed client reaches the server', (await open()) < before)
  return { checks }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'prepare') {
  const dir = resolve(process.argv[3])
  const must = (cmd, args, cwd = dir) => {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}:\n${r.stdout}${r.stderr}`)
  }
  must('node', [join(repo, 'packages/create-weft/bin/create-weft.mjs'), dir, '--db', 'none', '--ui', 'none', '--name', 'rt'], repo)
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name of Object.keys(deps ?? {})) if (name === '@weft-js/core' || name.startsWith('@weft-js/')) deps[name] = `file:${join(repo, 'packages', name.replace('@weft-js/core', 'weft').replace('@weft-js/create', 'create-weft').replace('@weft-js/warp-icons', 'icons').replace('@weft-js/', ''))}`
  pkg.dependencies.postgres = '4.0.0'
  pkg.dependencies['@weft-js/realtime-redis'] = `file:${join(repo, 'packages/realtime-redis')}`
  pkg.dependencies['@weft-js/realtime-nats'] = `file:${join(repo, 'packages/realtime-nats')}`
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  const fixture = join(here, '../test/fixtures/app/src')
  cpSync(join(fixture, 'server/feed.ts'), join(dir, 'src/server/feed.ts'))
  cpSync(join(fixture, 'schema.ts'), join(dir, 'src/schema.ts'))
  cpSync(join(fixture, 'routes/live.tsx'), join(dir, 'src/routes/live.tsx'))
  cpSync(join(fixture, 'server/chat.ts'), join(dir, 'src/server/chat.ts'))
  cpSync(join(fixture, 'routes/chat.tsx'), join(dir, 'src/routes/chat.tsx'))
  writeFileSync(join(dir, 'src/realtime.server.ts'), `import { realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'
import { redisBus } from '@weft-js/realtime-redis'
import { natsBus } from '@weft-js/realtime-nats'
const { WEFT_RT_POSTGRES: pg, WEFT_RT_REDIS: redis, WEFT_RT_NATS: nats } = process.env
export default realtime(pg ? { bus: postgresBus({ url: pg }) } : redis ? { bus: redisBus({ url: redis }) } : nats ? { bus: natsBus({ servers: nats }) } : {})
`)
  must('npm', ['install', '--no-audit', '--no-fund'])
  console.log(`prepared ${dir}`)
}
