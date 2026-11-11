// `gen plan` and `gen run` on the mock: the reference guard, the seat guard, the lock and the raw cache, and the CLI's
// refusal to run without caps.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { GenRefused, planGen, runGen } from '../src/gen/index.mjs'
import { cleanup, counted, distil, guidePng, project, scratch } from './gen.fixture.ts'

afterEach(cleanup)

const CLI = fileURLToPath(new URL('../src/gen/cli.mjs', import.meta.url))
const ledger = (cacheDir: string) =>
  readFileSync(join(cacheDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
const lockOf = (file: string) =>
  JSON.parse(readFileSync(file, 'utf8')) as {
    slots: Record<
      string,
      { request: string; candidate: number; basis: { file: string; digest: string } }
    >
  }
const three = {
  a: { op: 'make', says: 'a stone', out: 'palette:4', size: '16x16' },
  b: { op: 'make', says: 'a leaf', out: 'palette:4', size: '16x16' },
  c: { op: 'make', says: 'a shell', out: 'palette:4', size: '16x16' },
}
const caps = { maxCalls: 10, maxWallMs: 60_000 }

describe('the reference guard', () => {
  it('refuses a guide inside a reference folder, and a copy of one elsewhere, before any call', async () => {
    const p = project({ sky: { op: 'over', on: 'id:sky', says: 'soft cloud', out: 'palette:4' } })
    const reference = join(p.dir, 'reference')
    mkdirSync(join(reference, 'deep'), { recursive: true })
    const kept = join(reference, 'deep', 'capture.png')
    writeFileSync(kept, guidePng(16, 12, 9))
    const copy = join(p.dir, 'copy.png')
    copyFileSync(kept, copy)
    for (const path of [kept, copy]) {
      const { adapter, calls } = counted()
      const run = runGen({
        ...p,
        ...caps,
        adapter,
        distil,
        reference: [reference],
        guides: () => [{ role: 'image', path }],
      })
      await expect(run).rejects.toThrow(GenRefused)
      await expect(run).rejects.toThrow(
        path === kept ? /inside a reference folder/ : /same bytes as a reference file/,
      )
      expect(calls).toHaveLength(0)
    }
    expect(ledger(p.cacheDir).map((line) => line.outcome)).toEqual(['blocked', 'blocked'])
    expect(existsSync(p.lockFile)).toBe(false)
  })

  it('refuses a prompt with a denied term the template brought in', async () => {
    const p = project({ sky: { op: 'over', on: 'id:sky', says: 'soft cloud', out: 'palette:4' } })
    const { adapter, calls } = counted()
    const guide = guidePng()
    await expect(
      runGen({
        ...p,
        ...caps,
        adapter,
        distil,
        deny: ['horizon'],
        guides: () => [{ role: 'image', bytes: guide }],
      }),
    ).rejects.toThrow(/denied term `horizon`/)
    expect(calls).toHaveLength(0)
  })
})

describe('the seat guard', () => {
  it('stops before the call that would cross maxCalls, with a consistent lock', async () => {
    const p = project(three)
    const { adapter, calls } = counted()
    const result = await runGen({ ...p, adapter, distil, maxCalls: 2, maxWallMs: 60_000 })
    expect(calls).toHaveLength(2)
    expect(result.calls).toBe(2)
    expect(result.stopped).toEqual({
      reason: 'the next call would make 3 calls, over maxCalls 2',
      slot: 'c',
    })
    const lock = lockOf(p.lockFile)
    expect(Object.keys(lock.slots)).toEqual(['a', 'b'])
    for (const entry of Object.values(lock.slots)) {
      const basis = readFileSync(join(p.dir, entry.basis.file))
      expect(entry.basis.file).toBe(`basis/${entry.basis.digest.slice(0, 16)}.kmx`)
      expect(basis.toString()).toMatch(/^KMX2 /)
      expect(existsSync(join(p.cacheDir, 'raw', entry.request, '0.png'))).toBe(true)
    }
  })

  it('makes no call when the wall cap is under one call’s estimate', async () => {
    const p = project(three)
    const { adapter, calls } = counted()
    const result = await runGen({ ...p, adapter, distil, maxCalls: 10, maxWallMs: 5 })
    expect(calls).toHaveLength(0)
    expect(result.stopped?.reason).toMatch(/over maxWallMs 5/)
    expect(existsSync(p.lockFile)).toBe(false)
  })

  it('refuses to run without both caps', async () => {
    const p = project(three)
    const { adapter } = counted()
    await expect(runGen({ ...p, adapter, distil, maxCalls: 2 } as never)).rejects.toThrow(
      /maxWallMs/,
    )
  })
})

describe('the lock and the raw cache', () => {
  it('a lock hit makes no call; a re-roll makes exactly one, keeping the old output', async () => {
    const p = project(three)
    const first = counted()
    await runGen({ ...p, ...caps, adapter: first.adapter, distil })
    expect(first.calls).toHaveLength(3)
    const before = lockOf(p.lockFile)
    const again = counted()
    const second = await runGen({ ...p, ...caps, adapter: again.adapter, distil })
    expect(again.calls).toHaveLength(0)
    expect(second.slots.map((s) => s.state)).toEqual(['locked', 'locked', 'locked'])
    const roll = counted()
    await runGen({ ...p, ...caps, adapter: roll.adapter, distil, reroll: ['b'] })
    expect(roll.calls).toHaveLength(1)
    const after = lockOf(p.lockFile)
    expect(after.slots.a).toEqual(before.slots.a)
    expect(after.slots.b!.request).not.toBe(before.slots.b!.request)
    expect(after.slots.b!.basis.digest).not.toBe(before.slots.b!.basis.digest)
    expect(existsSync(join(p.cacheDir, 'raw', before.slots.b!.request, '0.png'))).toBe(true)
  })

  it('a cached request makes no call when the lock is lost', async () => {
    const p = project(three)
    await runGen({ ...p, ...caps, adapter: counted().adapter, distil })
    const before = readFileSync(p.lockFile, 'utf8')
    rmSync(p.lockFile)
    const { adapter, calls } = counted()
    const result = await runGen({ ...p, ...caps, adapter, distil })
    expect(calls).toHaveLength(0)
    expect(result.slots.map((s) => s.state)).toEqual(['cached', 'cached', 'cached'])
    expect(JSON.parse(readFileSync(p.lockFile, 'utf8')).slots.a.request).toBe(
      JSON.parse(before).slots.a.request,
    )
  })

  it('plans without writing or calling: miss, then locked, then cached', async () => {
    const p = project(three)
    const { adapter, calls } = counted()
    const plan = await planGen({ ...p, adapter })
    expect(plan.rows.map((r) => [r.slot, r.state, r.calls])).toEqual([
      ['a', 'miss', 1],
      ['b', 'miss', 1],
      ['c', 'miss', 1],
    ])
    expect(plan.totals).toEqual({ calls: 3, wallMs: 30, seatTokens: 0 })
    expect(calls).toHaveLength(0)
    expect(existsSync(join(p.dir, '.weft'))).toBe(false)
    await runGen({ ...p, adapter, distil, maxCalls: 2, maxWallMs: 60_000 })
    rmSync(join(p.dir, lockOf(p.lockFile).slots.b!.basis.file))
    const later = await planGen({ ...p, adapter })
    expect(later.rows.map((r) => r.state)).toEqual(['locked', 'cached', 'miss'])
  })
})

describe('failures', () => {
  it('records a refusal and a wrong size on the ledger, retrying within the slot’s calls', async () => {
    const p = project({
      no: { op: 'make', says: 'a stone', out: 'params', params: { simulate: 'refusal' } },
      small: {
        op: 'make',
        says: 'a leaf',
        out: 'params',
        size: '32x32',
        calls: 2,
        params: { simulate: 'wrong-size' },
      },
      fine: { op: 'make', says: 'a shell', out: 'params', size: '8x8' },
    })
    const { adapter, calls } = counted()
    const result = await runGen({ ...p, ...caps, adapter, distil })
    expect(calls).toHaveLength(4)
    expect(result.slots.map((s) => [s.slot, s.state])).toEqual([
      ['no', 'failed'],
      ['small', 'failed'],
      ['fine', 'made'],
    ])
    expect(result.slots[1]!.error).toBe('asked for 32x32, got 16x32')
    expect(ledger(p.cacheDir).map((line) => [line.slot, line.outcome, line.calls])).toEqual([
      ['no', 'refused', 1],
      ['small', 'wrong-size', 1],
      ['small', 'wrong-size', 1],
      ['fine', 'ok', 1],
    ])
    expect(Object.keys(lockOf(p.lockFile).slots)).toEqual(['fine'])
  })

  it('takes the critic’s pick among candidates', async () => {
    const p = project({ two: { op: 'make', says: 'a stone', out: 'params', n: 2, size: '8x8' } })
    const seen: number[] = []
    await runGen({
      ...p,
      ...caps,
      adapter: counted().adapter,
      distil,
      critic: ({ candidates }) => {
        seen.push(candidates.length)
        return Promise.resolve({ pick: 1, scores: [3, 8] })
      },
    })
    expect(seen).toEqual([2])
    expect(lockOf(p.lockFile).slots.two!.candidate).toBe(1)
  })
})

describe('the CLI', () => {
  it('refuses `run` without both caps, and plans', () => {
    const p = project(three)
    const fail = () =>
      execFileSync(process.execPath, [CLI, 'run', p.recipeFile, '--max-calls', '3'], {
        cwd: scratch(),
        stdio: 'pipe',
      })
    expect(fail).toThrow(/give both caps, --max-calls N and --max-wall-ms N/)
    const out = execFileSync(process.execPath, [CLI, 'plan', p.recipeFile], {
      cwd: scratch(),
      encoding: 'utf8',
    })
    expect(out).toMatch(/^a {2}mock {2}make {2}n=1 {2}miss {2}1 call\(s\)/)
    expect(out).toMatch(/total: 3 call\(s\)/)
  })
})
