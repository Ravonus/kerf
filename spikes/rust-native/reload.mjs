// What can a running process do with a rebuilt addon? Runs on Node, Bun and Deno:
//   node reload.mjs  |  bun reload.mjs  |  deno run -A reload.mjs
import { copyFileSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'reload-'))
const require = createRequire(import.meta.url)
const load = (file) => {
  const m = { exports: {} }
  process.dlopen(m, file)
  return m.exports
}
const out = {}

// 1. The same path, its bytes replaced by a rename: what `require` and dlopen do with a rebuild in place.
const fixed = join(dir, 'fixed.node')
copyFileSync(join(here, 'v1.node'), fixed)
const a = load(fixed)
out.first = a.version()
copyFileSync(join(here, 'v2.node'), fixed + '.tmp')
const { renameSync } = await import('node:fs')
renameSync(fixed + '.tmp', fixed)
try {
  out.samePathAfterRename = load(fixed).version()
} catch (e) {
  out.samePathAfterRename = `threw: ${e.message}`
}

// 2. Each build at a path of its own.
const p1 = join(dir, 'a-1.node'),
  p2 = join(dir, 'a-2.node')
copyFileSync(join(here, 'v1.node'), p1)
copyFileSync(join(here, 'v2.node'), p2)
const one = load(p1),
  two = load(p2)
out.newPath = [one.version(), two.version(), one.version(), two.version()]

// 3. A call in flight on the old copy while the new one serves.
const slow = one.slow(200)
const quick = await two.slow(1)
out.inFlight = { old: await slow, new: quick }

// 4. Does a third copy, loaded 50 times, cost anything to speak of?
const before = process.memoryUsage().rss
const t = performance.now()
for (let i = 0; i < 50; i++) {
  const p = join(dir, `n-${i}.node`)
  copyFileSync(join(here, i % 2 ? 'v1.node' : 'v2.node'), p)
  load(p).version()
}
out.fifty = {
  ms: Math.round(performance.now() - t),
  rssMb: Math.round((process.memoryUsage().rss - before) / 1e6),
}

// 5. In a worker, as the dev server's is: load, terminate, load the next.
try {
  const { Worker } = await import('node:worker_threads')
  const body = `const { parentPort, workerData } = require('node:worker_threads'); const m = { exports: {} }; process.dlopen(m, workerData); parentPort.postMessage(m.exports.version())`
  const inWorker = (file) =>
    new Promise((ok, no) => {
      const w = new Worker(body, { eval: true, workerData: file })
      w.once('message', async (v) => {
        await w.terminate()
        ok(v)
      })
      w.once('error', no)
    })
  out.workers = [await inWorker(p1), await inWorker(p2), await inWorker(p1)]
} catch (e) {
  out.workers = `threw: ${e.message}`
}

console.log(JSON.stringify(out, null, 1))
