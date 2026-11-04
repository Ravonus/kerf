// Times the wasm pipelines in workerd (`wrangler dev`, local only) from outside, since workerd's clocks stand still
// during compute: `node worker/client.mjs <takumi|satori|card> [coldSamples] [warmN]`. Each cold sample is a fresh
// `wrangler dev`: the first request pays isolate start, wasm instantiation, font registration and the first render.
// /ping's median (the client ↔ wrangler proxy ↔ workerd round trip) is subtracted from every number.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [which, coldArg = '3', warmArg = '30'] = process.argv.slice(2)
const port = { takumi: 8787, satori: 8788, card: 8789 }[which]
const base = `http://127.0.0.1:${port}`
const pct = (xs, p) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]
const time = async (path) => {
  const s = performance.now()
  const r = await fetch(base + path)
  const body = new Uint8Array(await r.arrayBuffer())
  if (!r.ok) throw new Error(`${path}: ${r.status} ${new TextDecoder().decode(body).slice(0, 300)}`)
  return { ms: performance.now() - s, body }
}

function start() {
  const child = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '-c',
      join(here, `wrangler.${which}.jsonc`),
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--inspector-port',
      '0',
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: join(here, '..'),
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let log = ''
  return new Promise((resolve, reject) => {
    const on = (d) => {
      log += d
      if (/Ready on/.test(log)) resolve(child)
    }
    child.stdout.on('data', on)
    child.stderr.on('data', on)
    child.on('exit', (c) => reject(new Error(`wrangler exited ${c}\n${log}`)))
  })
}
const stop = (child) =>
  new Promise((r) => {
    child.once('exit', r)
    child.kill('SIGINT')
  })

const result = {
  pipeline: which === 'card' ? 'renderCard (Takumi wasm)' : `${which}-wasm`,
  runtime: 'workerd (wrangler dev, local)',
  cold: [],
  warm: {},
}
for (let i = 0; i < Number(coldArg); i++) {
  const child = await start()
  try {
    const pings = []
    for (let j = 0; j < 20; j++) pings.push((await time('/ping')).ms) // /ping never builds the renderer
    const ping = pct(pings, 0.5)
    const first = await time('/?card=default')
    result.cold.push({ firstDefaultMs: first.ms - ping, pingMs: ping })
    if (i === 0) {
      mkdirSync(join(here, '..', 'out'), { recursive: true })
      writeFileSync(join(here, '..', 'out', `default.${which}-workerd.png`), first.body)
      for (const card of ['default', 'avatar']) {
        const xs = []
        const firstCard = await time(`/?card=${card}`)
        if (card === 'avatar')
          writeFileSync(join(here, '..', 'out', `avatar.${which}-workerd.png`), firstCard.body)
        for (let j = 0; j < Number(warmArg); j++) xs.push((await time(`/?card=${card}`)).ms - ping)
        result.warm[card] = { p50: pct(xs, 0.5), p95: pct(xs, 0.95) }
      }
    }
  } finally {
    await stop(child)
  }
}
console.log(JSON.stringify(result))
