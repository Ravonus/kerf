// Sample allocated space without following links or accepting an incomplete, raced traversal.
import assert from 'node:assert/strict'
import { lstatSync, readdirSync, statfsSync } from 'node:fs'
import { loadavg } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'

const gib = 1024 ** 3
const filesystem = { lstatSync, readdirSync }
const identity = (stat) => `${stat.dev}:${stat.ino}`

function rootIdentity(root, io) {
  const stat = io.lstatSync(root, { bigint: true })
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Owned root is not a regular directory')
  return identity(stat)
}

function scanOwned(root, limit, io) {
  const pending = [root],
    seen = new Set()
  let blocks = 0n
  while (pending.length) {
    const path = pending.pop(),
      stat = io.lstatSync(path, { bigint: true })
    const id = identity(stat)
    if (seen.has(id)) continue
    seen.add(id)
    assert.ok(typeof stat.blocks === 'bigint' && stat.blocks >= 0n, 'Invalid allocated blocks')
    blocks += stat.blocks
    assert.ok(blocks * 512n < BigInt(limit), 'Owned root would reach 5 GiB or its reserved limit')
    if (stat.isDirectory()) for (const name of io.readdirSync(path)) pending.push(join(path, name))
  }
  return Number(blocks * 512n)
}

/** Retry only descendant ENOENT, restarting the whole count so a renamed subtree is not omitted. */
export function ownedBytes(root, limit = 5 * gib, io = filesystem) {
  assert.ok(Number.isSafeInteger(limit) && limit > 0, 'Invalid owned-space limit')
  const original = rootIdentity(root, io),
    disappearances = []
  for (let attempt = 0; attempt < 8; attempt++) {
    assert.equal(rootIdentity(root, io), original, 'Owned root changed during accounting')
    try {
      const owned = scanOwned(root, limit, io)
      assert.equal(rootIdentity(root, io), original, 'Owned root changed during accounting')
      return { owned, scanRetries: attempt, disappearances }
    } catch (error) {
      const path = typeof error.path === 'string' ? relative(root, error.path) : ''
      if (
        error.code !== 'ENOENT' ||
        !path ||
        path === '..' ||
        path.startsWith('..' + sep) ||
        isAbsolute(path)
      )
        throw error
      assert.equal(rootIdentity(root, io), original, 'Owned root changed during accounting')
      disappearances.push({ path: error.path, syscall: error.syscall })
      // Let an unpacker's rename burst finish; all eight failed scans still fail closed.
      if (attempt < 7) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2 ** attempt)
    }
  }
  throw new Error('Owned tree never completed a scan after 8 descendant disappearances')
}

function systemLimits(root, probes) {
  const disk = (probes.statfsSync ?? statfsSync)(root)
  const free = disk.bavail * disk.bsize,
    load = (probes.loadavg ?? loadavg)()[0]
  assert.ok(
    Number.isSafeInteger(free) && free >= 10 * gib,
    'Less than 10 GiB free or invalid disk sample',
  )
  assert.ok(Number.isFinite(load) && load >= 0 && load <= 40, 'Host load exceeds 40 or is invalid')
  return { free, load }
}

/** Keep the existing real disk/load/owned-root limits, rechecking disk and load after each scan. */
export function resources(root, reserve = 0, probes = {}) {
  assert.ok(Number.isSafeInteger(reserve) && reserve >= 0 && reserve < 5 * gib, 'Invalid reserve')
  const before = systemLimits(root, probes)
  const counted = ownedBytes(root, 5 * gib - reserve, probes.filesystem ?? filesystem)
  const after = systemLimits(root, probes)
  return {
    free: Math.min(before.free, after.free),
    load: Math.max(before.load, after.load),
    ...counted,
    reserve,
  }
}
