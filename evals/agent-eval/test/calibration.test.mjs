import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { calibrationChecks, calibrationTarget } from '../run/calibration-target.mjs'

const entry = fileURLToPath(new URL('../run.mjs', import.meta.url))

test('calibration accepts only the fixed reference and named mutants', () => {
  assert.deepEqual(calibrationTarget(['medium-shop', 'reference']), {
    task: 'medium-shop',
    mutant: null,
  })
  assert.deepEqual(calibrationTarget(['reference']), { task: 'medium-shop', mutant: null })
  assert.deepEqual(calibrationTarget(['edit-shop', 'reference']), {
    task: 'edit-shop',
    mutant: null,
  })
  assert.equal(
    calibrationTarget(['medium-shop', 'mutant', 'wrong stock']).mutant.mustFail,
    'products show names, prices, stock and default order',
  )
  for (const args of [
    [],
    ['reference', '/tmp/app'],
    ['mutant', '../other'],
    ['run'],
    ['mutant'],
    ['../other', 'reference'],
  ])
    assert.throws(() => calibrationTarget(args))
})

test('entrypoint refuses an arbitrary calibration target before loading the grader', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(process.execPath, [entry, 'calibrate', 'mutant', '/tmp/app'], {
    env,
    encoding: 'utf8',
  })
  assert.equal(child.status, 2)
  assert.match(child.stderr, /unknown medium-shop mutant/)
})

test('an alternate staging root isolates state and projects', async () => {
  const { evalPaths } = await import('../lib/paths.mjs')
  assert.deepEqual(evalPaths('/private/tmp/example'), {
    state: '/private/tmp/example/state',
    projects: '/private/tmp/example/projects',
    goldens: '/private/tmp/example/state/golden',
    tgz: '/private/tmp/example/state/tgz',
  })
  assert.equal(evalPaths().state, '/private/tmp/aeval')
  assert.equal(evalPaths().projects, '/private/tmp/projects')
  assert.throws(() => evalPaths('relative'))
  assert.throws(() => evalPaths('/'))
})

test('calibration resolves its golden under the requested root', () => {
  const env = { ...process.env, WEFT_EVAL_ROOT: '/private/tmp/missing-weft-calibration-fixture' }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(process.execPath, [entry, 'calibrate', 'reference'], {
    env,
    encoding: 'utf8',
  })
  assert.equal(child.status, 2)
  assert.match(child.stderr, /missing-weft-calibration-fixture\/state\/golden\/weft-warp\/app/)
})

test('calibration dependency closure loads from the alternate directory', async () => {
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'weft-eval-deps-'))
  try {
    mkdirSync(join(root, 'node_modules/playwright-core'), { recursive: true })
    mkdirSync(join(root, 'node_modules/axe-core'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, 'node_modules/playwright-core/index.js'), 'exports.chromium = {}')
    writeFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'fixture')
    const env = { ...process.env, WEFT_EVAL_DEPS: root }
    delete env.NODE_TEST_CONTEXT
    const grade = fileURLToPath(new URL('../lib/grade.mjs', import.meta.url))
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', 'await import(process.argv[1]); console.log("loaded")', grade],
      { env, encoding: 'utf8' },
    )
    assert.equal(child.status, 0, child.stderr)
    assert.match(child.stdout, /loaded/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('calibration sandbox denies the owner home as well as its fresh HOME', () => {
  const sandbox = fileURLToPath(new URL('../lib/sandbox.mjs', import.meta.url))
  const env = { ...process.env, WEFT_EVAL_HOST_HOME: '/private/tmp/owner-home-fixture' }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const m = await import(process.argv[1]); console.log(m.profile({root:"/private/tmp/owned-box"}))',
      sandbox,
    ],
    { env, encoding: 'utf8' },
  )
  assert.equal(child.status, 0, child.stderr)
  assert.match(child.stdout, /deny file-read\*[^\n]*owner-home-fixture/)
  assert.match(child.stdout, /allow file-read\*[^\n]*owned-box/)
})

test('bugfix calibration selects the full guarded suite', async () => {
  const module = await import('../tasks/bugfix-shop/hidden.mjs')
  assert.deepEqual(calibrationTarget(['bugfix-shop', 'reference']), {
    task: 'bugfix-shop',
    mutant: null,
  })
  assert.equal(calibrationChecks('bugfix-shop', module), module.calibrationTests)
  assert.equal(calibrationChecks('bugfix-shop', module).length, 14)
  assert.throws(
    () => calibrationChecks('bugfix-shop', { calibrationTests: module.tests }),
    /invalid bugfix-shop calibration check count/,
  )
  assert.throws(() => calibrationChecks('../other', module), /unknown calibration task/)
})

test('actual hidden grader dispatches all bugfix calibration checks', async () => {
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'weft-hidden-dispatch-'))
  try {
    mkdirSync(join(root, 'node_modules/playwright-core'), { recursive: true })
    mkdirSync(join(root, 'node_modules/axe-core'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(
      join(root, 'node_modules/playwright-core/index.js'),
      `
      exports.chromium = { launch: async () => ({
        newContext: async () => ({setDefaultTimeout() {}, newPage: async () => ({
          on() {}, goto() { throw new Error('fixture stops browser checks') }
        }), close: async () => {}}), close: async () => {}
      }) }
    `,
    )
    writeFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'fixture')
    const env = { ...process.env, WEFT_EVAL_DEPS: root }
    delete env.NODE_TEST_CONTEXT
    const grade = fileURLToPath(new URL('../lib/grade.mjs', import.meta.url))
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const { hidden } = await import(process.argv[1]);
      const result = await hidden('bugfix-shop', 'http://fixture', true);
      console.log(JSON.stringify({total: result.total, failed: result.failed.length}));
    `,
        grade,
      ],
      { env, encoding: 'utf8' },
    )
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(child.stdout), { total: 14, failed: 14 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
