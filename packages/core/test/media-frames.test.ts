import { afterEach, expect, it, vi } from 'vitest'
import { createFramePlayer } from '../src/media-frames'
import type { MediaAsset } from '../src/media'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('seeks directly to an independent chunk, draws its authored patches and closes every bitmap', async () => {
  const painted: { x: number; y: number }[] = [],
    closed: number[] = [],
    requested: string[] = []
  const context = {
    clearRect: vi.fn(),
    drawImage: (_image: unknown, x: number, y: number) => painted.push({ x, y }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => {
      const index = closed.length
      return Promise.resolve({ close: () => closed.push(index) })
    }),
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL) => {
      requested.push(String(url))
      if (String(url).endsWith('second.json'))
        return Promise.resolve(
          Response.json({
            start: 2,
            end: 4,
            frames: [
              { time: 2, duration: 1, x: 0, y: 0, width: 4, height: 4, src: 'full.webp' },
              { time: 3, duration: 1, x: 1, y: 1, width: 1, height: 1, src: 'patch.webp' },
            ],
          }),
        )
      return Promise.resolve(new Response(new Blob(['fixture'])))
    }),
  )
  const asset: MediaAsset = {
    kind: 'video',
    src: '/original.mp4',
    name: 'film.mp4',
    type: 'video/mp4',
    width: 4,
    height: 4,
    duration: 4,
    sources: [],
    frames: {
      version: 1,
      pixels: 'exact',
      chunks: [
        { start: 0, end: 2, src: '/first.json' },
        { start: 2, end: 4, src: '/second.json' },
      ],
    },
  }
  const player = createFramePlayer(document.createElement('canvas'), asset)
  expect(requested).toEqual([])
  const seeked = new Promise((resolve) => {
    player.addEventListener('seeked', resolve, { once: true })
  })
  player.currentTime = 3.2
  await seeked
  expect(requested.some((url) => url.endsWith('/first.json'))).toBe(false)
  expect(painted).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])
  expect(closed).toHaveLength(2)
  await player.play()
  expect(player.paused).toBe(false)
  player.pause()
  expect(player.paused).toBe(true)
  player.destroy()
  await expect(player.play()).rejects.toThrow('disposed')
})
it('abort disposes a pending frame request without drawing or starting audio', async () => {
  let signal: AbortSignal | undefined
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal!
      return new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        })
      })
    }),
  )
  const abort = new AbortController(),
    asset: MediaAsset = {
      kind: 'video',
      src: '/a.mp4',
      type: 'video/mp4',
      name: 'a.mp4',
      width: 4,
      height: 4,
      duration: 2,
      sources: [],
      frames: { version: 1, pixels: 'exact', chunks: [{ start: 0, end: 2, src: '/first.json' }] },
    }
  const player = createFramePlayer(document.createElement('canvas'), asset, {
    signal: abort.signal,
  })
  const pending = player.play()
  abort.abort()
  await expect(pending).rejects.toThrow('Aborted')
  expect(signal?.aborted).toBe(true)
})
