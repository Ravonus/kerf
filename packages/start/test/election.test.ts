import { afterEach, expect, it, vi } from 'vitest'

type Grant = () => Promise<void> | undefined
const requests: { options: LockOptions; grant: Grant }[] = []

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  requests.length = 0
})

it('a steal granted after stop() is handed back, and the stopped tab does not lead', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, options: LockOptions, grant: Grant) => {
        requests.push({ options, grant })
        return new Promise(() => {}) // nothing is granted until the test says so
      },
    },
  })
  const { campaign } = await import('../src/link/election')
  const won = vi.fn()
  const election = campaign('test-election', won, () => {})
  expect(requests).toHaveLength(1)
  election.probe() // no leader answers, so this tab steals the lock
  vi.advanceTimersByTime(1600)
  expect(requests).toHaveLength(2)
  expect(requests[1]!.options.steal).toBe(true)
  election.stop()
  expect(requests[1]!.grant()).toBeUndefined() // released at once
  expect(won).not.toHaveBeenCalled()
  expect(election.leading()).toBe(false)
})

it('holdTab goes on without the lock when the request fails, and keeps working after', async () => {
  vi.resetModules()
  let fail = true
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, grant: Grant) =>
        fail ? Promise.reject(new Error('no locks here')) : Promise.resolve(grant()),
    },
  })
  const { holdTab } = await import('../src/link/election')
  const first = vi.fn()
  holdTab(first)
  await vi.waitFor(() => expect(first).toHaveBeenCalled())
  fail = false
  const second = vi.fn()
  holdTab(second)
  await vi.waitFor(() => expect(second).toHaveBeenCalled())
})
