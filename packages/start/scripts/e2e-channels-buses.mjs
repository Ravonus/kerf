import { freePort, sleep } from '../../../scripts/lib/helpers.mjs'
// The redis and nats buses across two real instances, on each runtime (research 32 §6): both started by this script
// on throwaway servers. A message said on one instance reaches a client of the other, in both directions, and a shared
// value crosses too.
//
//   node packages/start/scripts/e2e-realtime.mjs prepare <dir>
//   node packages/start/scripts/e2e-channels-buses.mjs <dir> [--runtimes node,bun,deno] [--redis <bin>] [--nats <bin>]
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fnId, open } from '../test/ws-client.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runtimes: { type: 'string', default: 'node,bun,deno' },
    redis: { type: 'string', default: 'redis-server' },
    nats: { type: 'string', default: 'nats-server' },
  },
})
const app = resolve(positionals[0])
const SERVERS = {
  node: ['node', ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs']],
  bun: ['bun', ['run', '.output/server/index.mjs']],
  deno: ['deno', ['run', '-A', '.output/server/index.mjs']],
}
const kids = new Set()
const start = (cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: 'ignore', ...opts })
  kids.add(c)
  return c
}

async function instance(runtime, env) {
  const port = await freePort()
  const [cmd, args] = SERVERS[runtime]
  start(cmd, args, {
    cwd: app,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    },
  })
  const url = `http://localhost:${port}`
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(url + '/', { redirect: 'manual' })
      return url
    } catch {
      await sleep(100)
    }
  }
  throw new Error(`${runtime} on ${port} did not answer`)
}

async function cross(url1, url2) {
  const room = fnId('room'),
    roomId = `r${Date.now()}`
  const a = await open(url1),
    b = await open(url2)
  await a.until('h')
  await b.until('h')
  a.send('j', 1, room, { roomId })
  b.send('j', 1, room, { roomId })
  await a.until('j')
  await b.until('j')
  a.send('m', 1, 1, 'say', { text: 'a to b' })
  if ((await b.until('m'))[4].text !== 'a to b') throw new Error('a to b')
  await a.until('m')
  b.send('m', 1, 1, 'say', { text: 'b to a' })
  if ((await a.until('m'))[4].text !== 'b to a') throw new Error('b to a')
  a.close()
  b.close()
}

let failed = false
const redisPort = await freePort(),
  natsPort = await freePort()
start(values.redis, ['--port', String(redisPort), '--save', '', '--appendonly', 'no'])
start(values.nats, ['-p', String(natsPort)])
await sleep(500)
try {
  for (const runtime of values.runtimes.split(',')) {
    const built = spawnSync(join(app, 'node_modules/.bin/weft'), ['build', '--runtime', runtime], {
      cwd: app,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (built.status !== 0) throw new Error(`${runtime} build:\n${built.stdout}${built.stderr}`)
    for (const { bus, env } of [
      { bus: 'redis', env: { WEFT_RT_REDIS: `redis://127.0.0.1:${redisPort}` } },
      { bus: 'nats', env: { WEFT_RT_NATS: `127.0.0.1:${natsPort}` } },
    ]) {
      const live = new Set(kids)
      try {
        await cross(await instance(runtime, env), await instance(runtime, env))
        console.log(`[buses] ${runtime} ${bus}: two instances cross`)
      } catch (e) {
        failed = true
        console.log(`[buses] ${runtime} ${bus}: FAIL ${e.message}`)
      }
      for (const k of kids) {
        if (live.has(k)) continue
        k.kill('SIGKILL')
        kids.delete(k)
      }
    }
  }
} finally {
  for (const k of kids) k.kill('SIGKILL')
}
process.exit(failed ? 1 : 0)
