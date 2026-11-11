// Is a wasm verifier worth shipping? Runs on Node, Bun and Deno: `node bench/verify.mjs`, after
//   cargo build --release --target wasm32-unknown-unknown --manifest-path bench/verify/Cargo.toml
//   wasm-opt -O3 bench/verify/target/wasm32-unknown-unknown/release/kerf_pay_verify.wasm -o bench/verify.wasm
// Measures three ways to check one Stripe-shaped signature: what the rail did first (WebCrypto `sign`, then a loop over hex),
// WebCrypto `verify`, and HMAC-SHA256 with `subtle` in wasm. Each gets a fresh key import, as a request would.
import { readFileSync } from 'node:fs'

const encoder = new TextEncoder()
const secret = 'whsec_placeholder_for_the_benchmark_only'
const body = JSON.stringify({
  id: 'evt_1',
  type: 'invoice.paid',
  data: { object: { id: 'in_1', lines: 'x'.repeat(+(globalThis.process?.argv[2] ?? 2000)) } },
})
const text = `1700000000.${body}`
const key = () =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
const signature = new Uint8Array(
  await crypto.subtle.sign('HMAC', await key(), encoder.encode(text)),
)
const hex = [...signature].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16))
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

function same(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const bytes = readFileSync(new URL('./verify.wasm', import.meta.url))
const started = performance.now()
const wasm = (await WebAssembly.instantiate(bytes)).instance.exports
const coldWasm = performance.now() - started
const secretBytes = encoder.encode(secret)

const ways = {
  'sign + hex loop': async () =>
    same(toHex(await crypto.subtle.sign('HMAC', await key(), encoder.encode(text))), hex),
  'subtle.verify': async () =>
    crypto.subtle.verify('HMAC', await key(), fromHex(hex), encoder.encode(text)),
  'wasm hmac + subtle': () => {
    const message = encoder.encode(text)
    const tag = fromHex(hex)
    const len = secretBytes.length + message.length + 32
    const at = wasm.input(len) // may grow memory, which detaches an earlier `buffer`
    const view = new Uint8Array(wasm.memory.buffer, at, len)
    view.set(secretBytes)
    view.set(message, secretBytes.length)
    view.set(tag, secretBytes.length + message.length)
    return wasm.verify(secretBytes.length) === 1
  },
}

const rows = []
for (const [name, run] of Object.entries(ways)) {
  if (!(await run())) throw new Error(`${name} refused a good signature`)
  for (let i = 0; i < 20000; i++) await run() // warm
  const times = []
  for (let r = 0; r < 7; r++) {
    const t = performance.now()
    for (let i = 0; i < 20000; i++) await run()
    times.push(((performance.now() - t) / 20000) * 1000)
  }
  rows.push({ name, us: times.sort((a, b) => a - b)[3] })
}
const runtime = globalThis.Bun
  ? `bun ${Bun.version}`
  : globalThis.Deno
    ? `deno ${Deno.version.deno}`
    : `node ${process.version}`
console.log(
  JSON.stringify({
    runtime,
    bodyBytes: text.length,
    wasmBytes: bytes.length,
    wasmColdMs: +coldWasm.toFixed(2),
    medianMicroseconds: Object.fromEntries(rows.map((r) => [r.name, +r.us.toFixed(1)])),
  }),
)
