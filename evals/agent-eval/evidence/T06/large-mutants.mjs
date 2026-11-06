// Rebuild named changes in the owned app, retaining failures without treating setup as a catch.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkBudget } from './large-reference.mjs'

export function mutate(source, mutant) {
  if (source.split(mutant.find).length !== 2)
    throw new Error(`mutation target count: ${mutant.name}`)
  return source.replace(mutant.find, mutant.replace)
}

export function verdict(child, checks, assertion) {
  if (child.error || child.signal || ![0, 1].includes(child.status) || !Array.isArray(checks))
    return 'inconclusive'
  if (child.status === 0) return 'survived'
  const failures = checks.filter((item) => item.ok === false)
  if (failures.length !== 1 || failures[0].name === 'owned listener') return 'inconclusive'
  const message = failures[0].error ?? ''
  const expected = `assertion:${assertion}`
  return message === expected || message.startsWith(`${expected}:`) ? 'caught' : 'inconclusive'
}

export function runMutants({
  app,
  repo,
  job,
  receipts,
  pnpm,
  run = spawnSync,
  ready = checkBudget,
}) {
  if (resolve(app) !== join(resolve(job), 'state/golden/weft-warp/app'))
    throw new Error('app is outside the owned golden')
  const task = join(repo, 'evals/agent-eval/tasks/large-live')
  const reference = join(task, 'reference/weft-warp/src')
  const mutants = JSON.parse(readFileSync(join(task, 'mutants.json'), 'utf8'))
  if (mutants.length !== 8 || new Set(mutants.map((item) => item.name)).size !== 8)
    throw new Error('invalid large mutant set')
  const secret = readFileSync(join(app, '.env'), 'utf8').match(/^BETTER_AUTH_SECRET=(.*)$/m)?.[1]
  if (!secret) throw new Error('missing fixture secret')
  const outcomes = []
  for (const [index, mutant] of mutants.entries()) {
    ready(job)
    const dir = join(receipts, `mutant-${String(index + 1).padStart(2, '0')}`)
    mkdirSync(dir)
    cpSync(reference, join(app, 'src'), { recursive: true })
    const target = join(app, 'src', mutant.file)
    if (!resolve(target).startsWith(`${join(app, 'src')}/`))
      throw new Error('invalid mutation path')
    writeFileSync(target, mutate(readFileSync(target, 'utf8'), mutant))
    rmSync(join(app, '.data'), { recursive: true, force: true })
    rmSync(join(app, '.output'), { recursive: true, force: true })
    const build = run(process.execPath, [pnpm, 'run', 'build'], {
      cwd: app,
      env: process.env,
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 5 * 1024 * 1024,
    })
    writeFileSync(
      join(dir, 'build.log'),
      `${build.stdout ?? ''}${build.stderr ?? ''}`.replaceAll(secret, '[redacted]'),
    )
    let result = 'inconclusive'
    if (build.status === 0 && !build.error && !build.signal) {
      ready(job)
      const env = { ...process.env, WEFT_T06_APP: app, WEFT_T06_RECEIPTS: dir }
      delete env.NODE_TEST_CONTEXT
      const child = run(
        process.execPath,
        [join(repo, 'evals/agent-eval/evidence/T06/large-smoke.mjs')],
        { cwd: app, env, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
      )
      writeFileSync(
        join(dir, 'smoke.log'),
        `${child.stdout ?? ''}${child.stderr ?? ''}`.replaceAll(secret, '[redacted]'),
      )
      let checks
      try {
        checks = JSON.parse(readFileSync(join(dir, 'runtime-smoke.json'), 'utf8'))
      } catch {
        checks = null
      }
      result = verdict(child, checks, mutant.assertion)
    }
    outcomes.push({ name: mutant.name, expected: mutant.assertion, result })
    writeFileSync(join(receipts, 'mutant-outcomes.json'), JSON.stringify(outcomes, null, 2) + '\n')
    if (result === 'inconclusive') throw new Error(`${mutant.name}: inconclusive; see ${dir}`)
  }
  cpSync(reference, join(app, 'src'), { recursive: true })
  if (outcomes.some((item) => item.result !== 'caught'))
    throw new Error('one or more mutants survived')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {
    WEFT_T06_APP: app,
    WEFT_T06_REPO: repo,
    WEFT_T06_JOB: job,
    WEFT_T06_RECEIPTS: receipts,
    WEFT_T06_PNPM: pnpm,
  } = process.env
  if (!app || !repo || !job || !receipts || !pnpm)
    throw new Error('missing owned staging configuration')
  runMutants({ app, repo, job, receipts, pnpm })
}
