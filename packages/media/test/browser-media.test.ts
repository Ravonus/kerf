import { afterEach, expect, it, vi } from 'vitest'
import { initialMediaLevel, slowMediaConnection } from '../src/media-network'
import {
  playlistLevels,
  playlistStarts,
  warmFetch,
  mediaStartPlaylist,
} from '../src/media-warm-fetch'
import { warmMediaStarts } from '../src/media-warm'

it('automatically warmed frame starts fetch the manifest and complete first-frame images only', async () => {
  browser()
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      requests.push(url)
      return Promise.resolve(
        new Response(
          url.endsWith('.json')
            ? JSON.stringify({
                frames: [{ src: 'first.avif', fallback: 'first.webp' }, { src: 'later.webp' }],
              })
            : 'image bytes',
        ),
      )
    }),
  )
  await warmMediaStarts([{ url: '/chunks/0.json', width: 640, height: 360, kind: 'frames' }], {
    intervalMs: 0,
  }).done
  expect(requests.map((url) => new URL(url).pathname)).toEqual([
    '/chunks/0.json',
    '/chunks/first.avif',
    '/chunks/first.webp',
  ])
})
it('warms bounded native files without interpreting them as playlists', async () => {
  browser()
  const getReader = vi.fn(() => new Response('native movie').body!.getReader())
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '12' }),
        body: { getReader },
      }),
    ),
  )
  await warmMediaStarts([{ url: '/small.mp4', width: 640, height: 360, kind: 'file' }], {
    intervalMs: 0,
  }).done
  expect(getReader).toHaveBeenCalledOnce()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function browser() {
  vi.stubGlobal('location', { href: 'https://art.example/gallery' })
  vi.stubGlobal('navigator', { connection: {} })
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('document', {
    hidden: false,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}
it('starts at displayed quality unless bandwidth-first delivery is explicitly requested', () => {
  const levels = [
    { width: 480, height: 270, bitrate: 100_000 },
    { width: 960, height: 540, bitrate: 400_000 },
    { width: 1280, height: 720, bitrate: 900_000 },
  ]
  expect(initialMediaLevel(levels, 800, 450)).toBe(1)
  expect(initialMediaLevel(levels, 800, 450, {}, 1.5)).toBe(2)
  expect(
    initialMediaLevel(
      levels,
      1280,
      720,
      { effectiveType: '2g' },
      { pixelRatio: 1, quality: 'bandwidth' },
    ),
  ).toBe(0)
  expect(
    initialMediaLevel(
      levels,
      1280,
      720,
      { saveData: true },
      { pixelRatio: 1, quality: 'bandwidth' },
    ),
  ).toBe(0)
  expect(slowMediaConnection({ downlink: 0.5 })).toBe(true)
})
it('resolves only the first HLS start and refuses cross-origin resources', () => {
  browser()
  const base = 'https://art.example/streams/medium/index.m3u8'
  expect(
    playlistStarts('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\n0.m4s\n1.m4s', base),
  ).toEqual({
    init: 'https://art.example/streams/medium/init.mp4',
    first: 'https://art.example/streams/medium/0.m4s',
  })
  expect(
    playlistLevels(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=960x540\nmedium/index.m3u8',
      'https://art.example/streams/master.m3u8',
    )[0]?.width,
  ).toBe(960)
  expect(() => playlistStarts('#EXTM3U\nhttps://elsewhere.example/movie.ts', base)).toThrow(
    'same-origin',
  )
})
it('cancels unknown-length oversized bodies instead of downloading the whole movie', async () => {
  browser()
  const cancelled = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(80))
              controller.enqueue(new Uint8Array(80))
            },
            cancel: cancelled,
          }),
        ),
      ),
    ),
  )
  const received: number[] = []
  await expect(
    warmFetch('https://art.example/start.m4s', new AbortController().signal, 100, (bytes) =>
      received.push(bytes),
    ),
  ).rejects.toThrow('budget')
  expect(cancelled).toHaveBeenCalledOnce()
  expect(received).toEqual([80, 80])
})
it('warms one complete first segment, reuses HTTP cache, and deduplicates artwork sources', async () => {
  browser()
  const fetcher = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(
        url.endsWith('.m3u8')
          ? '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\n0.m4s\n1.m4s'
          : 'small',
      ),
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  const target = { url: 'https://art.example/a.m3u8', width: 640, height: 360 }
  await warmMediaStarts([target, target], { startDelayMs: 0, intervalMs: 0 }).done
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    target.url,
    'https://art.example/init.mp4',
    'https://art.example/0.m4s',
  ])
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'force-cache', priority: 'low' })
})
it('does not speculate in data-saver mode and aborts an in-flight request on disposal', async () => {
  browser()
  vi.stubGlobal('navigator', { connection: { saveData: true } })
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const targets = [{ url: 'https://art.example/a.m3u8', width: 640, height: 360 }]
  await warmMediaStarts(targets, { startDelayMs: 0 }).done
  expect(fetcher).not.toHaveBeenCalled()
  vi.stubGlobal('navigator', { connection: {} })
  const begun = Promise.withResolvers<AbortSignal>()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal!
          begun.resolve(signal)
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    ),
  )
  const queue = warmMediaStarts(targets, { startDelayMs: 0 })
  const signal = await begun.promise
  queue.cancel()
  await queue.done
  expect(signal.aborted).toBe(true)
})

it('waits for the next byte window before starting another artwork', async () => {
  browser()
  vi.useFakeTimers()
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      new Response(url.endsWith('.m3u8') ? '#EXTM3U\n#EXTINF:2,\n0.m4s' : new Uint8Array(1000)),
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  const queue = warmMediaStarts(
    [
      { url: 'https://art.example/a.m3u8', width: 640, height: 360 },
      { url: 'https://art.example/b.m3u8', width: 640, height: 360 },
    ],
    { startDelayMs: 0, intervalMs: 0, windowBytes: 33_000, windowMs: 6000 },
  )
  await vi.advanceTimersByTimeAsync(0)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(4000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(2001)
  await vi.runAllTimersAsync()
  await queue.done
  expect(fetcher).toHaveBeenCalledTimes(4)
})

it('defers speculative work until the foreground poster has settled', async () => {
  browser()
  vi.useFakeTimers()
  const poster = { complete: false }
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelectorAll: (selector: string) => (selector.startsWith('img') ? [poster] : []),
  })
  const fetcher = vi.fn(() => Promise.resolve(new Response('#EXTM3U\n')))
  vi.stubGlobal('fetch', fetcher)
  const queue = warmMediaStarts([{ url: 'https://art.example/a.m3u8', width: 640, height: 360 }], {
    startDelayMs: 0,
    intervalMs: 0,
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(fetcher).not.toHaveBeenCalled()
  poster.complete = true
  await vi.advanceTimersByTimeAsync(2001)
  await vi.runAllTimersAsync()
  await queue.done
  expect(fetcher).toHaveBeenCalledOnce()
})

it('does not turn a low browser bandwidth estimate into a blurry startup frame', () => {
  const levels = [
    { width: 384, height: 384, bitrate: 669216 },
    { width: 640, height: 640, bitrate: 3216562 },
    { width: 960, height: 960, bitrate: 6182127 },
  ]
  expect(initialMediaLevel(levels, 960, 960, { effectiveType: '4g', downlink: 1.45 }, 1.5)).toBe(2)
  expect(initialMediaLevel(levels, 960, 960, { effectiveType: '2g' }, 1.5)).toBe(2)
  expect(
    initialMediaLevel(
      levels,
      960,
      960,
      { effectiveType: '4g', downlink: 1.45 },
      { pixelRatio: 1.5, quality: 'bandwidth' },
    ),
  ).toBe(0)
})
it('fully consumes clear first fragments larger than the old 256 KiB ceiling', async () => {
  browser()
  const fragment = new Response(new Uint8Array(1024 * 1024), {
    headers: { 'Content-Length': String(1024 * 1024) },
  })
  const reader = vi.spyOn(fragment.body!, 'getReader')
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('.m3u8') ? new Response('#EXTM3U\n#EXTINF:2,\n0.m4s') : fragment,
      ),
    ),
  )
  await warmMediaStarts([{ url: 'https://art.example/a.m3u8', width: 960, height: 960 }], {
    intervalMs: 0,
  }).done
  expect(reader).toHaveBeenCalledOnce()
})
it('prepares sharp stills and reprioritizes the current viewport before other starts', async () => {
  browser()
  const order: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      order.push(url)
      return Promise.resolve(new Response('#EXTM3U\n'))
    }),
  )
  await warmMediaStarts(
    [
      {
        url: 'https://art.example/top.m3u8',
        width: 960,
        height: 960,
        priority: () => 100,
        prepare: () => {
          order.push('top still')
          return Promise.resolve()
        },
      },
      {
        url: 'https://art.example/current.m3u8',
        width: 960,
        height: 960,
        priority: () => 0,
        prepare: () => {
          order.push('current still')
          return Promise.resolve()
        },
      },
    ],
    { intervalMs: 0 },
  ).done
  expect(order).toEqual([
    'current still',
    'https://art.example/current.m3u8',
    'top still',
    'https://art.example/top.m3u8',
  ])
})

it('native HLS selects the same sharp playlist instead of its adaptive master', async () => {
  browser()
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=384x384\n384.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=960x960\n960.m3u8',
        ),
      ),
    ),
  )
  expect(await mediaStartPlaylist('/streams/master.m3u8', 960, 960, 1.5)).toBe(
    'https://art.example/streams/960.m3u8',
  )
})
