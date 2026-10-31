// Per-call cost of each way to reach the sidecar, on whatever runtime runs this: node|bun|deno bench.mjs
// Start echo first (cargo run --release in echo/). A 100-item payload like research 06's, sequential, keep-alive.
import { createHmac } from 'node:crypto'
import http from 'node:http'

const runtime = globalThis.Bun ? `bun ${Bun.version}` : globalThis.Deno ? `deno ${Deno.version.deno}` : `node ${process.version}`
const items = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, title: `todo number ${i}`, done: i % 2 === 0 }))
const small = JSON.stringify({ input: { q: 'hello', limit: 20 } })
const big = JSON.stringify({ input: items })
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
const hexOf = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')

const viaFetch = (body, sig) => fetch('http://127.0.0.1:7911/f', { method: 'POST', body, headers: { 'content-type': 'application/json', ...(sig && { 'weft-sig': sig }) } }).then(r => r.text())
const agent = new http.Agent({ keepAlive: true })
const request = (options, body, sig) => new Promise((ok, no) => {
  const req = http.request({ ...options, agent, path: '/f', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(sig && { 'weft-sig': sig }) } }, res => {
    const parts = []
    res.on('data', d => parts.push(d))
    res.on('end', () => ok(Buffer.concat(parts).toString()))
  })
  req.on('error', no)
  req.end(body)
})
const viaHttp = (body, sig) => request({ host: '127.0.0.1', port: 7911 }, body, sig)
const viaUds = (body, sig) => request({ socketPath: '/tmp/weft-spike.sock' }, body, sig)

async function measure(name, call, n = 4000) {
  for (let i = 0; i < 500; i++) await call()
  const times = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await call()
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  console.log(`${runtime} | ${name.padEnd(38)} | p50 ${(times[n >> 1] * 1000).toFixed(0).padStart(5)} µs | p99 ${(times[Math.floor(n * 0.99)] * 1000).toFixed(0).padStart(5)} µs`)
}

await measure('fetch tcp small', () => viaFetch(small))
await measure('fetch tcp small + subtle hmac', async () => viaFetch(small, hexOf(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(small)))))
await measure('fetch tcp small + node:crypto hmac', () => viaFetch(small, createHmac('sha256', 'secret').update(small).digest('hex')))
await measure('fetch tcp 100 items', () => viaFetch(big))
await measure('node:http tcp small', () => viaHttp(small))
await measure('node:http tcp 100 items', () => viaHttp(big))
try {
  await viaUds(small)
  await measure('node:http unix small', () => viaUds(small))
  await measure('node:http unix 100 items', () => viaUds(big))
} catch (e) { console.log(`${runtime} | unix socket: ${e.message}`) }
await measure('in-process JSON parse+stringify 100', async () => JSON.stringify(JSON.parse(big)))
process.exit(0)
