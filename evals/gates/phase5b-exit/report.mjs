import { loadavg } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from '../../lib/gate.mjs'

export function report(context) {
  const { checks, dir, runtimes, changed, speed, results, here, values, REQUIRED, log } = context
  const passed = checks.filter((c) => c.ok).length
  const failed = checks.filter((c) => !c.ok)
  const sizes = JSON.parse(
    readFileSync(join(dir, '.output/server/rust/manifest.json'), 'utf8'),
  ).media
  const host = `${process.platform}-${process.arch}, ${navigator.hardwareConcurrency} threads, load ${loadavg()[0].toFixed(1)} at the end`
  const result = {
    date: new Date().toISOString().slice(0, 10),
    ok: !failed.length,
    host,
    runtimes,
    changed,
    speed,
    wasm: results.wasm,
    sizes,
    checks,
  }
  mkdirSync(join(here, 'results'), { recursive: true })
  writeJson(join(here, `results/${values.results}.json`), result)
  const speedRows = Object.entries(speed).flatMap(([r, s]) => [
    `| ${r} | TS \`run\` | ${s.ts.p50} | ${s.ts.p99} | ${s.ts.perSecond} | |`,
    `| ${r} | addon | ${s.rust.p50} | ${s.rust.p99} | ${s.rust.perSecond} | **${s.latency}× p50, ${s.throughput}× calls/s** |`,
    ...(results.wasm[r]
      ? [
          `| ${r} | WASM | ${results.wasm[r].p50} | ${results.wasm[r].p99} | ${results.wasm[r].perSecond} | ${+(s.ts.p50 / results.wasm[r].p50).toFixed(1)}× p50 |`,
        ]
      : []),
  ])
  writeFileSync(
    join(here, `results/${values.results}.md`),
    `# Phase 5b exit check

${result.date}: **${failed.length ? 'FAIL' : 'PASS'}**, ${passed} of ${checks.length} checks, on ${host}. A CPU-bound demo beats its TS \`run\` by at least ${REQUIRED}×.
The swap is scripted (\`evals/gates/phase5b-exit.mjs\`, the app in \`evals/phase5b/\`), not done by an agent. \`weft start\` on ${runtimes.join(', ')}.

Changed under \`src/\`: ${changed.map((f) => `\`${f}\``).join(', ')}. Added: \`crates/media\`. Addon ${Math.round(sizes.bytes / 1024)} KB, WASM ${Math.round(sizes.wasmBytes / 1024)} KB.

| Check | Result | Detail |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : `**FAIL**: ${String(c.error).split('\n')[0].slice(0, 160).replaceAll('|', '\\|')}`} | ${c.detail ? `\`${JSON.stringify(c.detail).slice(0, 110).replaceAll('|', '\\|')}\`` : ''} |`).join('\n')}

## Speed

A 1600×1200 RGBA image, four passes of a 5-tap blur each way and an 8× box shrink, through the public \`GET /_weft/fn/<id>\`. TS and Rust produce the same bytes, which the wire check holds them to.
Sequential p50 and p99, then 32 callers at once. A within-weft comparison of two server bodies: the \`benchmarks/compare\` stacks have no server functions.

| Runtime | Body | p50 ms | p99 ms | calls/s | Over TS |
|---|---|---|---|---|---|
${speedRows.join('\n')}
`,
  )
  log(`${failed.length ? 'FAIL' : 'PASS'}: ${passed}/${checks.length}`)
  for (const f of failed) log(`  ${f.name}: ${String(f.error).slice(0, 300)}`)
  process.exit(failed.length ? 1 : 0)
}
