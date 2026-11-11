import { describe, expect, it } from 'vitest'
import { jobs, pool } from '../../../scripts/jobs.mjs'

describe('jobs', () => {
  it('takes the flag over the environment, and 1 runs one at a time', () => {
    expect(jobs(['--jobs=3'], { KERF_JOBS: '6' })).toBe(3)
    expect(jobs([], { KERF_JOBS: '1' })).toBe(1)
  })

  it('defaults to between 1 and 8', () => {
    expect(jobs([], {})).toBeGreaterThanOrEqual(1)
    expect(jobs([], {})).toBeLessThanOrEqual(8)
  })

  it('refuses anything but a whole number from 1', () => {
    for (const bad of ['0', '-1', '2.5', 'lots'])
      expect(() => jobs([`--jobs=${bad}`], {})).toThrow('whole number')
  })
})

describe('pool', () => {
  it('never runs more than the limit, and keeps the order', async () => {
    let now = 0,
      most = 0
    const out = await pool([30, 5, 20, 1, 10], 2, async (ms: number) => {
      most = Math.max(most, ++now)
      await new Promise((ok) => {
        setTimeout(ok, ms)
      })
      now--
      return ms * 2
    })
    expect(out).toEqual([60, 10, 40, 2, 20])
    expect(most).toBe(2)
  })
})
