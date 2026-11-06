// Real renames exercise retry/child lifetime; real small allocations and fault probes hold the limits.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  renameSync,
  writeFileSync,
  linkSync,
  symlinkSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ownedBytes, resources } from './profile-load-resources.mjs'
import { runStep } from './profile-style-process.mjs'

const gib = 1024 ** 3
const system = { statfsSync: () => ({ bavail: 20 * gib, bsize: 1 }), loadavg: () => [0] }

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'weft-resource-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function staging(root) {
  const stage = join(root, 'stage')
  mkdirSync(stage)
  writeFileSync(join(stage, 'payload'), Buffer.alloc(65536, 1))
  return stage
}

test('allocated blocks match du with hard links counted once and symlinks not followed', () =>
  fixture((root) => {
    const stage = staging(root),
      data = join(stage, 'payload')
    linkSync(data, join(root, 'hardlink'))
    symlinkSync(stage, join(root, 'symlink'))
    const measured = ownedBytes(root)
    const du = Number(execFileSync('du', ['-sk', root], { encoding: 'utf8' }).split(/\s/)[0])
    assert.equal(Math.ceil(measured.owned / 1024), du)
    assert.equal(measured.scanRetries, 0)
    assert.throws(() => ownedBytes(root, 32768), /Owned root/)
  }))

test('a real stage rename retries the whole scan and includes its newly named payload', () =>
  fixture((root) => {
    const stage = staging(root)
    let moved = false
    const io = {
      readdirSync,
      lstatSync(path, options) {
        if (path === stage && !moved) {
          moved = true
          renameSync(stage, join(root, 'final'))
        }
        return lstatSync(path, options)
      },
    }
    const measured = ownedBytes(root, 5 * gib, io)
    assert.equal(measured.scanRetries, 1)
    assert.equal(measured.disappearances.length, 1)
    assert.equal(measured.owned, ownedBytes(root).owned)
    assert.ok(measured.owned >= 65536)
  }))

test('permission/unexpected errors are fatal, missing root is fatal, retries are bounded', () =>
  fixture((root) => {
    const stage = staging(root)
    for (const code of ['EACCES', 'EPERM', 'EIO', 'ENOTDIR']) {
      const io = {
        lstatSync,
        readdirSync() {
          throw Object.assign(new Error(code), { code })
        },
      }
      assert.throws(() => ownedBytes(root, 5 * gib, io), { message: code })
    }
    for (const path of [root, join(root, '..', 'outside'), undefined]) {
      const io = {
        lstatSync,
        readdirSync() {
          throw Object.assign(new Error('unexpected ENOENT'), { code: 'ENOENT', path })
        },
      }
      assert.throws(() => ownedBytes(root, 5 * gib, io), { message: 'unexpected ENOENT' })
    }
    let failures = 0
    const io = {
      readdirSync,
      lstatSync(path, options) {
        if (path === stage) {
          failures++
          throw Object.assign(new Error('vanished'), { code: 'ENOENT', path, syscall: 'lstat' })
        }
        return lstatSync(path, options)
      },
    }
    assert.throws(() => ownedBytes(root, 5 * gib, io), /after 8/)
    assert.equal(failures, 8)
    assert.throws(() => ownedBytes(join(root, 'absent')), { code: 'ENOENT' })
  }))

test('root replacement and an actual directory-to-file change never become accepted retries', () =>
  fixture((root) => {
    const stage = staging(root)
    const io = {
      lstatSync,
      readdirSync(path) {
        if (path === stage) {
          rmSync(stage, { recursive: true })
          writeFileSync(stage, '')
        }
        return readdirSync(path)
      },
    }
    assert.throws(() => ownedBytes(root, 5 * gib, io), { code: 'ENOTDIR' })
    const replaced = {
      lstatSync,
      readdirSync(path) {
        if (path === stage) return readdirSync(path)
        renameSync(root, root + '-previous')
        mkdirSync(root)
        return []
      },
    }
    try {
      assert.throws(() => ownedBytes(root, 5 * gib, replaced), /root changed/)
    } finally {
      rmSync(root + '-previous', { recursive: true, force: true })
    }
  }))

test('exact disk/load/owned-plus-reserve boundaries and invalid samples remain fatal', () =>
  fixture((root) => {
    staging(root)
    const owned = ownedBytes(root).owned
    assert.throws(() => resources(root, 5 * gib - owned, system), /Owned root/)
    assert.ok(resources(root, 5 * gib - owned - 1, system).owned === owned)
    for (const free of [10 * gib - 1, NaN])
      assert.throws(
        () => resources(root, 0, { ...system, statfsSync: () => ({ bavail: free, bsize: 1 }) }),
        /10 GiB/,
      )
    for (const load of [40.01, NaN])
      assert.throws(() => resources(root, 0, { ...system, loadavg: () => [load] }), /load/)
    assert.equal(
      resources(root, 0, {
        ...system,
        statfsSync: () => ({ bavail: 10 * gib, bsize: 1 }),
        loadavg: () => [40],
      }).free,
      10 * gib,
    )
    let samples = 0
    assert.throws(
      () =>
        resources(root, 0, {
          ...system,
          statfsSync: () => ({ bavail: ++samples === 1 ? 20 * gib : 9 * gib, bsize: 1 }),
        }),
      /10 GiB/,
    )
  }))

async function monitoredChild(mode) {
  const root = mkdtempSync(join(tmpdir(), 'weft-monitored-')),
    stage = staging(root)
  const release = join(root, 'release'),
    logs = new Map(),
    receipts = new Map()
  let checks = 0,
    moved = false
  const io = {
    lstatSync(path, options) {
      if (mode === 'rename' && checks > 1 && path === stage && !moved) {
        moved = true
        renameSync(stage, join(root, 'final'))
      }
      return lstatSync(path, options)
    },
    readdirSync(path) {
      if (mode === 'error' && checks > 1 && path === stage) {
        rmSync(stage, { recursive: true })
        writeFileSync(stage, '')
      }
      return readdirSync(path)
    },
  }
  const check = (path, reserve) => {
    checks++
    assert.equal(reserve, 512 * 1024 ** 2)
    if (mode === 'cap' && checks > 1) ownedBytes(path, 32768)
    const sample = resources(path, reserve, { ...system, filesystem: io })
    if (checks > 1) writeFileSync(release, '')
    return sample
  }
  const log = {
    append: (name, bytes) => logs.set(name, (logs.get(name) ?? '') + bytes),
    json: (name, value) => receipts.set(name, value),
  }
  const step = {
    cwd: root,
    name: mode,
    command: process.execPath,
    timeoutMs: 5000,
    args: [
      '-e',
      'const fs=require("node:fs");setInterval(()=>{if(fs.existsSync(process.argv[1])){console.log("complete");process.exit(0)}},10)',
      release,
    ],
  }
  try {
    if (mode === 'rename') {
      await runStep(step, log, root, new AbortController().signal, check)
      assert.equal(receipts.get('rename-exit.json').exit, 0)
      assert.match(logs.get('rename.log'), /complete/)
      assert.match(logs.get('rename-resources.log'), /"scanRetries":1/)
      assert.ok(moved && checks > 1)
    } else {
      await assert.rejects(
        runStep(step, log, root, new AbortController().signal, check),
        /Failed manager step/,
      )
      const result = receipts.get(mode + '-exit.json')
      assert.equal(result.signal, 'SIGKILL')
      assert.equal(result.exit, null)
      assert.match(result.error, mode === 'cap' ? /Owned root/ : /ENOTDIR/)
      assert.equal(existsSync(release), false)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a real rename during monitoring preserves the successful child', () =>
  monitoredChild('rename'))
test('an actual allocated-space cap still kills the child', () => monitoredChild('cap'))
test('an actual unexpected filesystem error still kills the child', () => monitoredChild('error'))
