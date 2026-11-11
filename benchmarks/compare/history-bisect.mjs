#!/usr/bin/env node
// Reproduce the historical Git/receipt audit. This does not build with a mismatched compiler.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  HistoryRepository,
  compilerInputs,
  nativeArtifacts,
  requireArtifacts,
  sourceDelta,
} from './measure/history-source.mjs'
import {
  ancestryEdges,
  archivedRecords,
  firstParentEdges,
  receiptIntervals,
  sourceReceipt,
  stackVector,
  vectorDelta,
} from './measure/history-records.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const defaults = {
  from: 'e9b6b4782aa464144959ccf4dc4e02158f10b723',
  to: '37ad91b78dece687678f98b36ca2566618b9c5b6',
  receipts: '974fe2e1aff5dc3a8cf3186ac04ea64e6e090f22',
}

function step(repo, edge) {
  return {
    ...edge,
    subject: repo.git(['show', '-s', '--format=%s', edge.commit]),
    delta: sourceDelta(repo, edge.parent, edge.commit),
  }
}

function dependencies(repo, ref) {
  return repo
    .tree(ref)
    .filter(
      (entry) =>
        /(^|\/)(pnpm-lock.yaml|pnpm-workspace.yaml|package-lock.json|package.json)$/.test(
          entry.path,
        ) &&
        (/^[^/]+$/.test(entry.path) ||
          /^packages\/(kerf|core|veneer|ui-core|veneer-core)\/[^/]+$/.test(entry.path) ||
          /^evals\/compare\/(kerf-veneer|kerf-plain|solid-kobalte|react-radix|react-zustand|react-mui)\/[^/]+$/.test(
            entry.path,
          )),
    )
}

function conflicts(records) {
  return [...new Set(records.map((row) => row.source).filter(Boolean))].flatMap((source) => {
    const rows = records.filter((row) => row.source === source && row.dirty === false)
    return new Set(rows.map((row) => JSON.stringify(row.vector))).size > 1
      ? [{ source, lines: rows.map((row) => row.line), vectors: rows.map((row) => row.vector) }]
      : []
  })
}

/** Audit the fixed history range without altering source, dependencies or artifacts. */
export function auditHistory(repo, options) {
  const from = repo.resolve(options.from),
    to = repo.resolve(options.to)
  const container = repo.resolve(options.receipts)
  const records = archivedRecords(repo, container, to)
  const before = sourceReceipt(records, from),
    after = sourceReceipt(records, to)
  const firstSix = records.find(
    (row) =>
      row.sixStacks &&
      row.dirty === false &&
      row.ancestorOfTarget &&
      repo.ancestor(from, row.source),
  )
  const edges = ancestryEdges(repo, from, to),
    steps = edges.map((edge) => step(repo, edge))
  const strict = firstParentEdges(repo, from, to).map((edge) => step(repo, edge))
  const intervals = receiptIntervals(records, [from, ...edges.map((edge) => edge.commit)], steps)
  const largest = intervals.toSorted((a, b) => {
    const size = (row) =>
      (row.archivedDelta['kerf-veneer']?.js ?? 0) + (row.archivedDelta['kerf-veneer']?.css ?? 0)
    return size(b) - size(a)
  })[0]
  const pins = [...new Set([from, firstSix.source, largest.from, ...largest.inputChanges, to])].map(
    (ref) => ({
      ref,
      ...compilerInputs(repo, ref),
      dependencies: dependencies(repo, ref),
    }),
  )
  const available = nativeArtifacts(options.artifacts)
  const blockers = pins.map((pin) => ({
    ref: pin.ref,
    expectedStamp: pin.stamp,
    candidates: available.filter((file) => file.stamp === pin.stamp),
    hasPnpmWorkspace: !!repo.text(pin.ref, 'pnpm-workspace.yaml'),
  }))
  const totals = {}
  for (const entry of steps)
    for (const [group, bytes] of Object.entries(entry.delta.totals))
      totals[group] = (totals[group] ?? 0) + bytes
  const direct = sourceDelta(repo, from, to).totals
  for (const group of new Set([...Object.keys(direct), ...Object.keys(totals)]))
    if ((direct[group] ?? 0) !== (totals[group] ?? 0))
      throw new Error(`Source attribution does not telescope: ${group}`)
  const storedResults = JSON.parse(repo.text(to, 'evals/compare/results.json'))
  return {
    provenance: {
      from,
      to,
      container,
      archive: 'evals/results/compare-history.jsonl',
      node: process.version,
    },
    freshHistoricalBuilds: false,
    before,
    firstSix,
    after,
    archivedDelta: vectorDelta(before.vector, after.vector),
    completeArchivedDelta: vectorDelta(firstSix.vector, after.vector),
    resultsStoredAtTarget: stackVector(storedResults),
    baselineOnTargetFirstParent: repo
      .git(['rev-list', '--first-parent', to])
      .split('\n')
      .includes(from),
    available,
    blockers,
    pins,
    records,
    conflicts: conflicts(records),
    steps,
    strictFirstParent: strict,
    rawSourceDelta: direct,
    intervals,
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string', default: defaults.from },
      to: { type: 'string', default: defaults.to },
      receipts: { type: 'string', default: defaults.receipts },
      out: { type: 'string' },
      artifacts: { type: 'string', multiple: true },
      'require-artifacts': { type: 'boolean', default: false },
    },
  })
  if (!values.out) throw new Error('Pass --out with an owned receipt directory')
  const out = resolve(values.out),
    repo = new HistoryRepository(root)
  const report = auditHistory(repo, {
    ...values,
    artifacts: values.artifacts ?? [join(root, 'packages/core/native')],
  })
  report.provenance.toolFiles = Object.fromEntries(
    ['history-bisect.mjs', 'measure/history-source.mjs', 'measure/history-records.mjs'].map(
      (path) => [
        path,
        createHash('sha256')
          .update(readFileSync(new URL(path, import.meta.url)))
          .digest('hex'),
      ],
    ),
  )
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(
    JSON.stringify(
      {
        provenance: report.provenance,
        before: report.before.vector,
        firstSix: report.firstSix.vector,
        after: report.after.vector,
        steps: report.steps.length,
        strictFirstParentSteps: report.strictFirstParent.length,
        mergeBridges: report.steps
          .filter((edge) => edge.parentNumber !== 1)
          .map((edge) => edge.commit),
        blockers: report.blockers,
        rawSourceDelta: report.rawSourceDelta,
        freshHistoricalBuilds: false,
      },
      null,
      2,
    ),
  )
  if (values['require-artifacts']) requireArtifacts(report.pins, report.available)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
