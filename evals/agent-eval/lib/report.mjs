import { median as sharedMedian } from '../../../scripts/lib/helpers.mjs'
// Reads runs.jsonl and reports what was pre-registered: medians, spread, every failure. No run is dropped here; infra
// failures show in their own column.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const median = (xs) => (xs.length ? sharedMedian(xs) : null)
const fmt = (x) => (x === null || x === undefined ? 'n/a' : Math.round(x).toLocaleString('en-US'))
const spread = (xs) => (xs.length ? `${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))}` : 'n/a')

export function report(dir) {
  const runs = readFileSync(join(dir, 'runs.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  const groups = Map.groupBy(runs, (r) => `${r.task} | ${r.stack} | ${r.model}`)
  const rows = [
    '| task | stack | model | n | infra | first-try pass | final pass | median total tokens (range) | uncached in+out | cache read | cache write | cost $ | turns | tools | wall s | bugs left |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ]
  for (const [key, all] of [...groups].sort()) {
    const ok = all.filter((r) => !r.infra),
      u = (f) => ok.map((r) => f(r.final.usage ?? {})).filter((x) => x !== undefined)
    rows.push(
      `| ${key} | ${ok.length} | ${all.length - ok.length} | ${ok.filter((r) => r.first.pass).length}/${ok.length} | ${ok.filter((r) => r.final.pass).length}/${ok.length} | ${fmt(median(u((x) => x.total)))} (${spread(u((x) => x.total))}) | ${fmt(median(u((x) => x.input + x.output)))} | ${fmt(median(u((x) => x.cacheRead)))} | ${fmt(median(u((x) => x.cacheWrite)))} | ${median(u((x) => x.costUsd))?.toFixed(3)} | ${median(u((x) => x.turns))} | ${median(ok.map((r) => r.activity.toolCalls))} | ${fmt(median(ok.map((r) => r.wallMs / 1000)))} | ${median(ok.map((r) => r.final.bugsLeft ?? 99))} |`,
    )
  }
  const failures = runs
    .filter((r) => !r.final.pass || r.infra)
    .map(
      (r) =>
        `- ${r.id} ${r.task} ${r.stack} ${r.model}: ${r.infra ? `infra: ${r.infra}` : `${r.status}; ${(r.final.hidden?.failed ?? []).map((f) => typeof f === 'string' ? f : `${f.title}: ${f.failure}`).join('; ')}`}`,
    )
  const diag = {},
    docs = {}
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.activity.diagnostics)) diag[k] = (diag[k] ?? 0) + v
    if (r.stack === 'weft-warp')
      for (const [k, v] of Object.entries(r.activity.docs)) docs[k] = (docs[k] ?? 0) + v
  }
  return [
    ...rows,
    '',
    `Isolation: ${runs.filter((r) => r.isolation.init.ok && !r.isolation.leaks.length).length}/${runs.length} runs clean.`,
    '',
    '## Failures',
    ...(failures.length ? failures : ['none']),
    '',
    '## weft: diagnostics met',
    JSON.stringify(diag),
    '',
    '## weft: docs read',
    JSON.stringify(docs),
  ].join('\n')
}
