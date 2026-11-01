// What a call costs: sync, then through the thread pool, with a 2 KB string.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
const m = { exports: {} }
process.dlopen(m, join(dirname(fileURLToPath(import.meta.url)), 'v1.node'))
const a = m.exports, s = 'x'.repeat(2048)
const time = async (name, n, f) => { for (let i = 0; i < n; i++) await f(); const t = performance.now(); for (let i = 0; i < n; i++) await f(); console.log(name, ((performance.now() - t) / n * 1000).toFixed(2), 'µs') }
await time('sync  ', 200000, () => a.noop(s))
await time('async ', 20000, () => a.echo(s))
