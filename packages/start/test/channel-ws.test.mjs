// `/_weft/ws` over a real WebSocket on the fixture's dev server: crossws through Nitro, the Origin check, and the same
// checks the runtime matrix runs on a built app (test/e2e/e2e-channels.mjs).
import { inject } from 'vitest'
import run from './e2e/e2e-channels.mjs'

const url = inject('url')

test('the protocol end to end', async () => {
  const { checks } = await run({ url, log: () => {} })
  expect(checks.length).toBeGreaterThan(15)
})
