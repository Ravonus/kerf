import { afterEach, expect, it, vi } from 'vitest'
import { mediaVideoSource } from '../src/media-startup'
import type { MediaAsset } from '../src/media'
afterEach(() => vi.unstubAllGlobals())
it('selects the clear display rendition independently of low network estimates', () => {
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal('navigator', { connection: { downlink: 0.4, effectiveType: '2g' } })
  const video = document.createElement('video')
  Object.defineProperties(video, { clientWidth: { value: 960 }, clientHeight: { value: 540 } })
  video.canPlayType = () => 'probably'
  const asset = {
    kind: 'video',
    src: '/960.mp4',
    width: 960,
    height: 540,
    type: 'video/mp4',
    name: 'movie',
    sources: [{ type: 'video/mp4', srcset: '/384.mp4 384w, /640.mp4 640w, /960.mp4 960w' }],
  } satisfies MediaAsset
  expect(mediaVideoSource(video, asset)).toEqual({ url: '/960.mp4', width: 960, height: 540 })
})
