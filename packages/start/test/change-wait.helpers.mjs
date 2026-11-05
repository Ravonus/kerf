// Poll change-feed tests without changing their timeout defaults or final assertion.
import { expect } from 'vitest'
import { sleep } from '../../../scripts/lib/sleep.mjs'

const poll = async (ok, ms) => {
  const end = Date.now() + ms
  while (!ok() && Date.now() < end) await sleep(5)
  expect(ok()).toBe(true)
}

export const until5000 = (ok, ms = 5000) => poll(ok, ms)
export const until6000 = (ok, ms = 6000) => poll(ok, ms)
