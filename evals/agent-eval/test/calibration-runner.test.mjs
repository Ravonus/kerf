import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('../evidence/T06/run-calibrations.mjs', import.meta.url))

function fixture(
  referencePass,
  breakFirst = false,
  taskName = 'medium-shop',
  count = 45,
  receiptTask = taskName,
  inconclusive = false,
) {
  const root = mkdtempSync(join(tmpdir(), 'weft-calibration-runner-'))
  const task = join(root, 'evals/agent-eval/tasks', taskName)
  const receipts = join(root, 'receipts')
  mkdirSync(join(root, 'projects'))
  mkdirSync(task, { recursive: true })
  const mutants = Array.from({ length: count }, (_, i) => ({
    name: `m${i}`,
    mustFail: 'expected check',
  }))
  writeFileSync(join(task, 'mutants.json'), JSON.stringify(mutants))
  writeFileSync(join(task, 'hidden.mjs'), 'export const tests = [{ title: "expected check" }]\n')
  writeFileSync(
    join(root, 'evals/agent-eval/run.mjs'),
    `
    const name = process.argv[5]
    const reference = process.argv[4] === 'reference'
    const ok = reference && ${referencePass}
    const broken = !reference && name === 'm0' && ${breakFirst}
    console.log(JSON.stringify({task: ${JSON.stringify(receiptTask)}, target: reference ? 'reference' : name, passed: ok,
      caught: !reference && !broken, grade: {built: {ok: !broken}, total: broken ? null : 1,
        failed: reference ? [] : [{title: 'expected check', failure: ${JSON.stringify(inconclusive ? 'flash timing inconclusive: retry calibration' : 'full failure detail')}}]}}))
    if (!ok) process.exitCode = 1
  `,
  )
  return { root, receipts, taskName }
}

function runFixture(item, extra = {}) {
  const env = { ...process.env, WEFT_T06_JOB: item.root, ...extra }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [runner, item.root, item.receipts, item.taskName], {
    encoding: 'utf8',
    env,
  })
}

test('failed reference retains its log and stops before any mutant', () => {
  const item = fixture(false)
  try {
    const child = runFixture(item)
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /reference failed/)
    assert.deepEqual(readdirSync(item.receipts).sort(), [
      'reference.json',
      'reference.stderr',
      'summary.jsonl',
    ])
    assert.equal(JSON.parse(readFileSync(join(item.receipts, 'reference.json'))).passed, false)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('runner verifies all named failures and retains detailed logs', () => {
  const item = fixture(true)
  try {
    const child = runFixture(item)
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(readFileSync(join(item.receipts, 'outcome.json'))), {
      mutants: 45,
      unexpected: 0,
    })
    const rows = readFileSync(join(item.receipts, 'summary.jsonl'), 'utf8').trim().split('\n')
    assert.equal(rows.length, 46)
    assert.match(readFileSync(join(item.receipts, 'mutant-01.json'), 'utf8'), /full failure detail/)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('a mutant setup failure stops the run and retains its detail', () => {
  const item = fixture(true, true)
  try {
    const child = runFixture(item)
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /calibration setup failed/)
    assert.match(readFileSync(join(item.receipts, 'mutant-01.json'), 'utf8'), /full failure detail/)
    assert.equal(
      readdirSync(item.receipts).some((name) => name.startsWith('mutant-02')),
      false,
    )
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('low disk space stops before reference execution', () => {
  const item = fixture(true)
  try {
    const bin = join(item.root, 'bin')
    mkdirSync(bin)
    writeFileSync(
      join(bin, 'df'),
      '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfake 20000000 11000000 9000000 55%% /\\n"\n',
      { mode: 0o755 },
    )
    const child = runFixture(item, { PATH: `${bin}:${process.env.PATH}` })
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /free space below 10 GiB/)
    assert.deepEqual(readdirSync(item.receipts), [])
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('runner rejects a receipt from another task', () => {
  const item = fixture(true, false, 'edit-shop', 20)
  const wrong = fixture(true, false, 'edit-shop', 20, 'medium-shop')
  try {
    const child = runFixture(item)
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(readFileSync(join(item.receipts, 'outcome.json'))), {
      mutants: 20,
      unexpected: 0,
    })
    assert.equal(JSON.parse(readFileSync(join(item.receipts, 'reference.json'))).task, 'edit-shop')
    const mismatched = runFixture(wrong)
    assert.notEqual(mismatched.status, 0)
    assert.match(mismatched.stderr, /reference failed/)
    assert.equal(
      readdirSync(wrong.receipts).some((name) => name.startsWith('mutant-')),
      false,
    )
  } finally {
    rmSync(item.root, { recursive: true, force: true })
    rmSync(wrong.root, { recursive: true, force: true })
  }
})

test('runner rejects a shortened edit mutant set before grading', () => {
  const item = fixture(true, false, 'edit-shop', 2)
  try {
    const child = runFixture(item)
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /invalid named mutant set/)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('runner rejects inconclusive timing instead of counting a caught mutant', () => {
  const item = fixture(true, false, 'edit-shop', 20, 'edit-shop', true)
  try {
    const child = runFixture(item)
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /flash timing inconclusive/)
    assert.match(readFileSync(join(item.receipts, 'mutant-01.json'), 'utf8'), /inconclusive/)
    assert.equal(
      readdirSync(item.receipts).some((name) => name === 'outcome.json'),
      false,
    )
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})
