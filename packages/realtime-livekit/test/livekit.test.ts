// The token, read back by LiveKit's own rules. The transport against a real server is `KERF_TEST_LIVEKIT` in Chromium:
// packages/multiplayer/test/e2e/e2e-browsers.mjs.
import { verifyTicket } from '@kerf/multiplayer/server'
import { livekitTicket } from '../src/server'

test('a token names the connection and limits it to data', async () => {
  const t = await livekitTicket({ key: 'k', secret: 's' })({
    id: 'conn',
    user: { name: 'Ana' },
    params: { id: 1 },
  })
  const claims = await verifyTicket(t, 's')
  expect(claims).toMatchObject({
    iss: 'k',
    sub: 'conn',
    name: 'Ana',
    video: { roomJoin: true, canPublish: false, canPublishData: true },
  })
  expect((claims!.video as { room: string }).room).not.toContain('1')
})

test('no keys is an error, not an anonymous room', async () => {
  delete process.env.LIVEKIT_API_KEY
  await expect(livekitTicket()({ id: 'c', user: {}, params: {} })).rejects.toThrow(
    'LIVEKIT_API_KEY',
  )
})
