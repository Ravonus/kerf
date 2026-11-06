// Bound profile evidence and lease ownership; clean up only processes and files created here.
import assert from 'node:assert/strict'
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { hash, MAX_OUTPUT } from './profile-load-pins.mjs'

/** One manager lease covers builds or profiling; an existing lease is never overwritten. */
export async function withLease(root, task) {
  const lock = join(root, '.profile-load-lease')
  mkdirSync(lock)
  try {
    writeFileSync(
      join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
    )
    return await task()
  } finally {
    unlinkSync(join(lock, 'owner.json'))
    rmdirSync(lock)
  }
}

/** Evidence is append-only in a fresh directory and has a fixed total-byte ceiling. */
export function evidence(out) {
  mkdirSync(out)
  let used = 0
  const bytes = (name, data) => {
    const cap = name === 'failure.json' ? MAX_OUTPUT : MAX_OUTPUT - 1048576
    assert.ok(used + data.length <= cap, 'Profile output exceeds 256 MiB cap')
    writeFileSync(join(out, name), data, { flag: 'wx' })
    used += data.length
  }
  return {
    json(name, value) {
      bytes(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'))
    },
    append(name, value) {
      const data = Buffer.from(value)
      assert.ok(used + data.length < MAX_OUTPUT - 1048576, 'Log/output cap exceeded')
      appendFileSync(join(out, name), data)
      used += data.length
    },
    compressed(name, data, limit) {
      assert.ok(data.length <= limit, `Raw capture exceeds cap: ${name}`)
      const compressed = gzipSync(data, { level: 6 })
      bytes(name, compressed)
      return {
        file: name,
        rawBytes: data.length,
        gzipBytes: compressed.length,
        rawSha256: hash(data),
        gzipSha256: hash(compressed),
      }
    },
    used: () => used,
  }
}

/** Close the connected browser, then kill its owned server if graceful shutdown stalls. */
export async function closeBrowser(browser, server) {
  let timer
  try {
    await Promise.race([
      (async () => {
        await browser?.close()
        await server?.close()
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser close timeout')), 5000)
      }),
    ])
  } finally {
    clearTimeout(timer)
    if (server) await server.kill()
  }
}

/** Hash the actual browser executable without retaining it as a copied artifact. */
export function browserPin(server, browser) {
  const executable = server.process().spawnfile
  return {
    version: browser.version(),
    executable,
    args: server.process().spawnargs,
    sha256: hash(readFileSync(executable)),
  }
}

/** Mark the exact trace category set in the receipts, along with this tool's source closure. */
export function toolPins(repo) {
  const folder = join(repo, 'benchmarks/compare')
  return Object.fromEntries(
    readdirSync(folder)
      .filter((name) => /^profile-load.*\.mjs$/.test(name))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => [relative(repo, join(folder, name)), hash(readFileSync(join(folder, name)))]),
  )
}
