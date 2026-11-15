import { afterEach, expect, it, vi } from 'vitest'
import { initialMediaLevel, slowMediaConnection } from '../src/media-network'
import { playlistLevels, playlistStarts, warmFetch } from '../src/media-warm-fetch'
import { warmMediaStarts } from '../src/media-warm'

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
it('starts normal connections at the displayed quality and reserves the lowest rung for slow links', () => {
  const levels = [
    { width: 480, height: 270, bitrate: 100_000 },
    { width: 960, height: 540, bitrate: 400_000 },
    { width: 1280, height: 720, bitrate: 900_000 },
  ]
  expect(initialMediaLevel(levels, 800, 450)).toBe(1)
  expect(initialMediaLevel(levels, 800, 450, {}, 1.5)).toBe(2)
  expect(initialMediaLevel(levels, 1280, 720, { effectiveType: '2g' })).toBe(0)
  expect(initialMediaLevel(levels, 1280, 720, { saveData: true })).toBe(0)
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
