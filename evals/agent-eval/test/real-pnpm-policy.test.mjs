import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pin, writePackedPolicy } from '../../../packages/create-kerf/scripts/tarballs.mjs'
import { normalizeOverrides } from '../lib/pnpm-policy.mjs'

const pnpm =
  process.env.KERF_T06_PNPM_ENTRY ??
  join(homedir(), '.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.mjs')

function verifyOldMutation({ golden, bad, gradePkg, tarballs, inherited, run }) {
  cpSync(golden, bad, { recursive: true })
  writeFileSync(
    join(bad, 'package.json'),
    JSON.stringify({
      ...gradePkg,
      pnpm: {
        overrides: {
          ...tarballs,
          inherited: '1.2.3',
          ...inherited,
          '@esbuild-kit/core-utils>esbuild': '0.25.0',
          'miniflare>sharp': '0.35.5',
        },
      },
    }),
  )
  writePackedPolicy(bad)
  appendFileSync(join(bad, 'pnpm-workspace.yaml'), '\nverifyDepsBeforeRun: error\n')
  const old = run(bad, ['run', 'check'])
  assert.notEqual(old.status, 0)
  assert.match(old.stdout + old.stderr, /ERR_PNPM_VERIFY_DEPS_BEFORE_RUN/)
  normalizeOverrides(bad)
  const fixed = run(bad, ['run', 'check'])
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr)
  const policy = readFileSync(join(bad, 'pnpm-workspace.yaml'), 'utf8')
  assert.match(policy, /minimumReleaseAge: 4320/)
  assert.match(policy, /allowBuilds:/)
  assert.match(policy, /verifyDepsBeforeRun: error/)
}

test('generated golden and grade-copy retain pnpm lockfile overrides', async (t) => {
  if (!existsSync(pnpm)) return t.skip('cached pnpm 12.15.0 is not available')
  const root = mkdtempSync(join(tmpdir(), 'kerf-real-pnpm-'))
  const golden = join(root, 'golden'),
    bad = join(root, 'bad')
  try {
    mkdirSync(golden)
    const tarballs = { '@kerf-js/core': 'file:/not-installed/core.tgz' }
    const inherited = { 'miniflare>undici': '7.30.1' }
    const pkg = pin(
      {
        name: 'fixture',
        private: true,
        scripts: { check: 'node -e "process.stdout.write(\'OK\')"' },
        overrides: { inherited: '1.2.3' },
      },
      tarballs,
    )
    writeFileSync(join(golden, 'package.json'), JSON.stringify(pkg))
    writePackedPolicy(golden, tarballs)
    appendFileSync(join(golden, 'pnpm-workspace.yaml'), '\nverifyDepsBeforeRun: error\n')
    normalizeOverrides(golden)
    const env = { PATH: process.env.PATH, HOME: root, CI: '1', COREPACK_ENABLE_NETWORK: '0' }
    const run = (cwd, args) =>
      spawnSync(process.execPath, [pnpm, ...args], { cwd, env, encoding: 'utf8' })
    const version = run(golden, ['--version'])
    assert.equal(version.stdout.trim(), '12.15.0')
    const installed = run(golden, ['install', '--offline', '--ignore-scripts'])
    assert.equal(installed.status, 0, installed.stdout + installed.stderr)
    const lock = readFileSync(join(golden, 'pnpm-lock.yaml'), 'utf8')
    assert.match(lock, /inherited: 1\.2\.3/)
    assert.match(lock, /miniflare>undici: 7\.30\.1/)
    assert.match(lock, /@kerf-js\/core/)
    const gradePkg = JSON.parse(readFileSync(join(golden, 'package.json')))
    gradePkg.pnpm = { overrides: { ...tarballs, inherited: '1.2.3', ...inherited } }
    writeFileSync(join(golden, 'package.json'), JSON.stringify(gradePkg))
    const deps = join(root, 'deps')
    mkdirSync(join(deps, 'node_modules/playwright-core'), { recursive: true })
    mkdirSync(join(deps, 'node_modules/axe-core'), { recursive: true })
    writeFileSync(join(deps, 'package.json'), '{}')
    writeFileSync(join(deps, 'node_modules/playwright-core/index.js'), 'exports.chromium = {}')
    writeFileSync(join(deps, 'node_modules/axe-core/axe.min.js'), 'fixture')
    const prior = process.env.KERF_EVAL_DEPS
    process.env.KERF_EVAL_DEPS = deps
    let grade
    try {
      if (process.platform === 'darwin') {
        const { cloneForGrading } = await import('../lib/grade.mjs')
        grade = (await cloneForGrading({ root: join(root, 'job'), app: golden }, 1)).app
      } else {
        grade = join(root, 'grade')
        cpSync(golden, grade, { recursive: true })
        normalizeOverrides(grade)
        t.diagnostic('macOS grade-copy integration is not available on this platform')
      }
    } finally {
      if (prior === undefined) delete process.env.KERF_EVAL_DEPS
      else process.env.KERF_EVAL_DEPS = prior
    }
    assert.ok(JSON.parse(readFileSync(join(golden, 'package.json'))).pnpm.overrides)
    assert.equal(JSON.parse(readFileSync(join(grade, 'package.json'))).pnpm, undefined)
    assert.equal(run(grade, ['config', 'get', 'minimumReleaseAge']).stdout.trim(), '4320')
    assert.equal(run(grade, ['config', 'get', 'verifyDepsBeforeRun']).stdout.trim(), 'error')
    const good = run(grade, ['run', 'check'])
    assert.equal(good.status, 0, good.stdout + good.stderr)
    assert.match(good.stdout, /OK/)
    verifyOldMutation({ golden, bad, gradePkg, tarballs, inherited, run })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
