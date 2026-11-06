// Prepare and check the owned large-live reference without invoking an agent.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const required = ['core', 'start', 'warp', 'warp-core', 'warp-icons', 'cli', 'db', 'multiplayer']
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))

export function validateReference(board, origin, session) {
  if (!/eq\(messages\.authorId, ctx\.user\.id\)/.test(board))
    throw new Error('missing author guard')
  if (!/origin !== new URL\(request\.url\)\.origin/.test(origin))
    throw new Error('missing origin guard')
  if (
    (board.match(/requireSameOrigin\(ctx\.request\)/g) ?? []).length !== 2 ||
    (session.match(/requireSameOrigin\(ctx\.request\)/g) ?? []).length !== 3
  )
    throw new Error('missing write origin checks')
}

export function prepare({ app, repo, job, origin, secret }) {
  const reference = join(repo, 'evals/agent-eval/tasks/large-live/reference')
  const source = join(reference, 'weft-warp')
  validateReference(
    readFileSync(join(source, 'src/server/board.ts'), 'utf8'),
    readFileSync(join(source, 'src/lib/origin.ts'), 'utf8'),
    readFileSync(join(source, 'src/server/session.ts'), 'utf8'),
  )
  const tarballs = read(join(job, 'state/tgz/tarballs.json'))
  for (const name of required)
    if (!tarballs[`@weft-js/${name}`]?.startsWith('file:'))
      throw new Error(`missing packed ${name}`)
  cpSync(source, app, { recursive: true })
  const pins = read(join(reference, 'dependencies.json'))
  const manifestPath = join(app, 'package.json')
  const manifest = read(manifestPath)
  manifest.dependencies = {
    ...manifest.dependencies,
    ...pins.dependencies,
    '@weft-js/db': tarballs['@weft-js/db'],
    '@weft-js/multiplayer': tarballs['@weft-js/multiplayer'],
  }
  manifest.devDependencies = { ...manifest.devDependencies, ...pins.devDependencies }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(
    join(app, '.env'),
    `DATABASE_URL=file:.data/app.db\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=${origin}\n`,
    { flag: 'wx', mode: 0o600 },
  )
}

function checkBudget(job) {
  const disk = execFileSync('df', ['-Pk', job], { encoding: 'utf8' })
  const free = Number(disk.trim().split('\n').at(-1).trim().split(/\s+/)[3])
  const used = Number(execFileSync('du', ['-sk', job], { encoding: 'utf8' }).trim().split(/\s+/)[0])
  const load = Number(
    execFileSync('uptime', { encoding: 'utf8' }).match(/load averages?:\s*([\d.]+)/)?.[1],
  )
  if (!Number.isFinite(free) || free < 10 * 1024 * 1024) throw new Error('free space below 10 GiB')
  if (!Number.isFinite(used) || used > 3 * 1024 * 1024) throw new Error('staging exceeds 3 GiB')
  if (!Number.isFinite(load) || load > 40) throw new Error('load is unavailable or above 40')
}

export function runSteps({
  app,
  repo,
  job,
  receipts,
  pnpm,
  secret,
  run = spawnSync,
  ready = checkBudget,
}) {
  const phases = [
    [
      'install',
      process.execPath,
      [pnpm, 'install', '--ignore-scripts', '--store-dir', join(job, 'store')],
    ],
    [
      'provenance',
      process.execPath,
      [
        join(repo, 'evals/agent-eval/evidence/T06/verify-packages.mjs'),
        app,
        join(job, 'provenance'),
        join(job, 'state/tgz/tarballs.json'),
      ],
    ],
    ['migrations', process.execPath, [pnpm, 'exec', 'weft', 'db', 'generate']],
    ['typecheck', process.execPath, [pnpm, 'run', 'typecheck']],
    ['build', process.execPath, [pnpm, 'run', 'build']],
  ]
  const results = []
  for (const [phase, command, args] of phases) {
    ready(job)
    const child = run(command, args, {
      cwd: app,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    })
    let log = `${child.stdout ?? ''}${child.stderr ?? ''}`.replaceAll(secret, '[redacted]')
    let error = child.error?.message ?? null
    if (phase === 'provenance' && child.status === 0 && !error && !child.signal) {
      try {
        const entries = JSON.parse(child.stdout)
        for (const name of required)
          if (!entries.some((entry) => entry.name === `@weft-js/${name}`))
            throw new Error(`unverified packed ${name}`)
      } catch (failure) {
        error = failure.message
        log += `\n${error}\n`
      }
    }
    writeFileSync(join(receipts, `${phase}.log`), log)
    const ok = child.status === 0 && !error && !child.signal
    results.push({ phase, ok, exit: child.status, signal: child.signal ?? null, error })
    writeFileSync(join(receipts, 'phases.json'), JSON.stringify(results, null, 2) + '\n')
    if (!ok) throw new Error(`${phase} failed; see ${phase}.log`)
  }
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
  const secret = randomBytes(32).toString('hex')
  prepare({ app, repo, job, origin: 'http://127.0.0.1:4173', secret })
  runSteps({ app, repo, job, receipts, pnpm, secret })
}
