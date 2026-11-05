// Keep every child receipt and distinguish a caught mutant from setup failure.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [repo, receipts, task = 'medium-shop'] = process.argv.slice(2)
if (!repo || !receipts) throw new Error('expected repository and receipt directory')
if (!['medium-shop', 'edit-shop'].includes(task)) throw new Error('unknown calibration task')
const mutants = JSON.parse(readFileSync(join(repo, 'evals/agent-eval/tasks', task, 'mutants.json')))
const expectedMutants = { 'medium-shop': 45, 'edit-shop': 18 }[task]
if (
  mutants.length !== expectedMutants ||
  new Set(mutants.map((m) => m.name)).size !== expectedMutants
)
  throw new Error('invalid named mutant set')
const { tests } = await import(
  pathToFileURL(join(repo, 'evals/agent-eval/tasks', task, 'hidden.mjs'))
)
if (!tests.length) throw new Error('the reference has no checks')
const env = { ...process.env }
delete env.NODE_TEST_CONTEXT
function ready() {
  for (;;) {
    const disk = execFileSync('df', ['-Pk', process.env.WEFT_T06_JOB ?? repo], { encoding: 'utf8' })
    const free = Number(disk.trim().split('\n').at(-1).trim().split(/\s+/)[3])
    if (!Number.isFinite(free) || free < 10 * 1024 * 1024)
      throw new Error('free space below 10 GiB')
    const footprint = Number(
      execFileSync('du', ['-sk', process.env.WEFT_T06_JOB ?? repo], { encoding: 'utf8' })
        .trim()
        .split(/\s+/)[0],
    )
    const golden = join(process.env.WEFT_T06_JOB ?? repo, 'state/golden/weft-warp/app')
    const copy = existsSync(golden)
      ? Number(execFileSync('du', ['-sk', golden], { encoding: 'utf8' }).trim().split(/\s+/)[0])
      : 0
    if (
      !Number.isFinite(footprint) ||
      !Number.isFinite(copy) ||
      footprint + 2 * copy > 3 * 1024 * 1024
    )
      throw new Error('staging and two grading copies would exceed 3 GiB')
    const uptime = execFileSync('uptime', { encoding: 'utf8' })
    const load = Number(uptime.match(/load averages?:\s*([\d.]+)/)?.[1])
    if (!Number.isFinite(load)) throw new Error('cannot read machine load')
    if (load <= 40) return
    console.error(`Load ${load} is over 40; waiting`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000)
  }
}
const run = (args, label) => {
  ready()
  const stdout = join(receipts, `${label}.json`),
    stderr = join(receipts, `${label}.stderr`)
  const out = openSync(stdout, 'wx'),
    err = openSync(stderr, 'wx')
  let child
  try {
    child = spawnSync(
      process.execPath,
      [join(repo, 'evals/agent-eval/run.mjs'), 'calibrate', task, ...args],
      {
        cwd: process.env.WEFT_T06_JOB ? join(process.env.WEFT_T06_JOB, 'projects') : repo,
        env,
        stdio: ['ignore', out, err],
        timeout: 300_000,
      },
    )
  } finally {
    closeSync(out)
    closeSync(err)
  }
  let result
  try {
    result = JSON.parse(readFileSync(stdout, 'utf8'))
  } catch {
    result = null
  }
  const summary = {
    label,
    exit: child.status,
    signal: child.signal,
    error: child.error?.message,
    target: result?.target,
    passed: result?.passed,
    caught: result?.caught,
    failed: result?.grade?.failed?.map((item) => item.title),
  }
  appendFileSync(join(receipts, 'summary.jsonl'), JSON.stringify(summary) + '\n')
  return { child, result }
}
mkdirSync(receipts, { recursive: true })
const reference = run(['reference'], 'reference')
if (
  reference.child.status !== 0 ||
  !reference.result?.passed ||
  reference.result?.task !== task ||
  !reference.result?.grade?.built?.ok ||
  reference.result?.grade?.total !== tests.length
)
  throw new Error('reference failed; retained its complete output and stopped before mutants')
let bad = 0
for (const [i, mutant] of mutants.entries()) {
  const label = `mutant-${String(i + 1).padStart(2, '0')}`
  const { child, result } = run(['mutant', mutant.name], label)
  if (
    !result ||
    !result.grade?.built?.ok ||
    result.grade.total !== tests.length ||
    child.error ||
    child.signal ||
    ![1, 2].includes(child.status)
  )
    throw new Error(`${mutant.name}: calibration setup failed; retained full logs`)
  if (
    child.status !== 1 ||
    result?.task !== task ||
    result?.target !== mutant.name ||
    !result?.caught ||
    !result?.grade?.built?.ok ||
    result?.grade?.total !== tests.length ||
    !result?.grade?.failed?.some((f) => f.title === mutant.mustFail)
  )
    bad++
}
writeFileSync(
  join(receipts, 'outcome.json'),
  JSON.stringify({ mutants: mutants.length, unexpected: bad }) + '\n',
)
if (bad) process.exitCode = 1
