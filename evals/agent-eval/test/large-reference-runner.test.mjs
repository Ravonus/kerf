import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { prepare, runSteps, validateReference } from '../evidence/T06/large-reference.mjs'

const repo = fileURLToPath(new URL('../../..', import.meta.url))
const names = ['core', 'start', 'warp', 'warp-core', 'warp-icons', 'cli', 'db', 'multiplayer']
function fixture() {
  const job = mkdtempSync(join(tmpdir(), 'weft-large-runner-'))
  const app = join(job, 'app'),
    receipts = join(job, 'receipts')
  mkdirSync(app)
  mkdirSync(receipts)
  mkdirSync(join(job, 'state/tgz'), { recursive: true })
  writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { existing: '1.0.0' } }))
  writeFileSync(
    join(app, 'pnpm-workspace.yaml'),
    'minimumReleaseAge: 4320\noverrides:\n  existing: 1.0.0\n',
  )
  writeFileSync(
    join(job, 'state/tgz/tarballs.json'),
    JSON.stringify(
      Object.fromEntries(names.map((name) => [`@weft-js/${name}`, `file:/packed/${name}.tgz`])),
    ),
  )
  return {
    app,
    job,
    repo,
    receipts,
    pnpm: '/pnpm.mjs',
    origin: 'http://127.0.0.1:4173',
    secret: 'test-secret-not-a-credential',
  }
}
const rm = (job) => rmSync(job, { recursive: true, force: true })

test('preparation preserves policy, pins packed packages and rejects changed guards', () => {
  const item = fixture()
  try {
    prepare(item)
    assert.match(
      readFileSync(join(item.app, 'pnpm-workspace.yaml'), 'utf8'),
      /minimumReleaseAge: 4320\noverrides:/,
    )
    const manifest = JSON.parse(readFileSync(join(item.app, 'package.json')))
    assert.equal(manifest.dependencies['@weft-js/db'], 'file:/packed/db.tgz')
    assert.equal(manifest.dependencies['@weft-js/multiplayer'], 'file:/packed/multiplayer.tgz')
    assert.equal(manifest.dependencies['better-auth'], '1.7.14')
    const source = join(item.app, 'src')
    const board = readFileSync(join(source, 'server/board.ts'), 'utf8')
    const origin = readFileSync(join(source, 'lib/origin.ts'), 'utf8')
    const session = readFileSync(join(source, 'server/session.ts'), 'utf8')
    validateReference(board, origin, session)
    assert.throws(
      () =>
        validateReference(
          board.replace('eq(messages.authorId, ctx.user.id)', 'true'),
          origin,
          session,
        ),
      /author guard/,
    )
    assert.throws(
      () =>
        validateReference(
          board,
          origin.replace('origin !== new URL(request.url).origin', 'false'),
          session,
        ),
      /origin guard/,
    )
    assert.throws(() => prepare(item), /EEXIST/)
  } finally {
    rm(item.job)
  }
})

test('runner stops on failed phase and redacts its full retained output', () => {
  const item = fixture(),
    calls = []
  try {
    const run = (_cmd, args) => {
      calls.push(args)
      if (calls.length === 2)
        return { status: 1, stdout: `failed ${item.secret}`, stderr: ' detail' }
      return { status: 0, stdout: '', stderr: '' }
    }
    assert.throws(() => runSteps({ ...item, run, ready() {} }), /provenance failed/)
    assert.equal(calls.length, 2)
    assert.equal(
      readFileSync(join(item.receipts, 'provenance.log'), 'utf8'),
      'failed [redacted] detail',
    )
    assert.deepEqual(
      JSON.parse(readFileSync(join(item.receipts, 'phases.json'))).map((row) => row.ok),
      [true, false],
    )
  } finally {
    rm(item.job)
  }
})

test('successful mocked phases require all packed package proofs', () => {
  const item = fixture(),
    calls = []
  try {
    const run = (_cmd, args) => {
      calls.push(args)
      return {
        status: 0,
        stdout:
          calls.length === 2
            ? JSON.stringify(names.map((name) => ({ name: `@weft-js/${name}` })))
            : '',
        stderr: '',
      }
    }
    runSteps({ ...item, run, ready() {} })
    assert.equal(calls.length, 5)
    assert.deepEqual(
      JSON.parse(readFileSync(join(item.receipts, 'phases.json'))).map((row) => row.phase),
      ['install', 'provenance', 'migrations', 'typecheck', 'build'],
    )
    assert.match(calls[2].join(' '), /weft db generate/)
  } finally {
    rm(item.job)
  }
})

test('runner rejects incomplete provenance before migration', () => {
  const item = fixture()
  let calls = 0
  try {
    const run = () => ({ status: 0, stdout: ++calls === 2 ? '[]' : '', stderr: '' })
    assert.throws(() => runSteps({ ...item, run, ready() {} }), /provenance failed/)
    assert.equal(calls, 2)
    assert.match(
      readFileSync(join(item.receipts, 'provenance.log'), 'utf8'),
      /unverified packed core/,
    )
    assert.equal(JSON.parse(readFileSync(join(item.receipts, 'phases.json')))[1].ok, false)
  } finally {
    rm(item.job)
  }
})
