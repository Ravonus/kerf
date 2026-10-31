// RTCPeerConnection needs a browser: packages/multiplayer/scripts/e2e-browsers.mjs runs this in Chromium, with the
// transport suite's requirements checked on a real room. Here, only what holds without one.
import { webrtc } from '../src/index'

test('a transport with a name', () => {
  expect(webrtc().name).toBe('webrtc')
})
