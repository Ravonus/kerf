// Every measurement in research 20 §9: `node run-all.mjs [coldSamples=5] [warmN=100]` → results/results.json.
// Node and Bun: one fresh process per cold sample (warm loop off), then one process with the warm loop.
// workerd: worker/client.mjs, one `wrangler dev` per cold sample.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [cold = '5', warm = '100'] = process.argv.slice(2)
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const run = (cmd, args) => JSON.parse(execFileSync(cmd, args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().split('\n').at(-1))

const results = []
for (const runtime of ['node', 'bun']) {
  for (const pipeline of ['takumi-native', 'takumi-wasm', 'satori-resvg-js', 'satori-resvg-wasm']) {
    const colds = Array.from({ length: Number(cold) }, () => run(runtime, ['bench.mjs', pipeline, '0']))
    const w = run(runtime, ['bench.mjs', pipeline, warm, '--save'])
    const r = {
      pipeline, runtime: w.runtime,
      cold: {
        importMs: median(colds.map(c => c.importMs)), initMs: median(colds.map(c => c.initMs)),
        firstDefaultMs: median(colds.map(c => c.first.default)), firstAvatarMs: median(colds.map(c => c.first.avatar)),
        totalMs: median(colds.map(c => c.totalColdMs)),
      },
      warm: w.warm,
    }
    console.error(JSON.stringify(r))
    results.push(r)
  }
}
for (const which of ['takumi', 'satori']) {
  const w = run('node', ['worker/client.mjs', which, cold, warm])
  const r = { pipeline: w.pipeline, runtime: w.runtime, cold: { firstDefaultMs: median(w.cold.map(c => c.firstDefaultMs)), samples: w.cold.map(c => c.firstDefaultMs) }, warm: w.warm }
  console.error(JSON.stringify(r))
  results.push(r)
}
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results', 'results.json'), JSON.stringify({ date: new Date().toISOString(), machine: 'M4 Max (darwin arm64)', cold: Number(cold), warm: Number(warm), results }, null, 2))
