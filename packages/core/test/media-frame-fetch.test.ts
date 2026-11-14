import { afterEach, expect, it, vi } from 'vitest'
import { FrameImages } from '../src/media-frame-fetch'
afterEach(() => vi.unstubAllGlobals())

it('overlaps requests within a three-request limit and deduplicates compressed frames', async () => {
  const releases: (() => void)[] = [],
    abort = new AbortController()
  let active = 0,
    peak = 0
  const fetcher = vi.fn(() => {
    active++
    peak = Math.max(peak, active)
    return new Promise<Response>((resolve) => {
      releases.push(() => {
        active--
        resolve(new Response(new Blob(['frame'])))
      })
    })
  })
  vi.stubGlobal('fetch', fetcher)
  const frames = new FrameImages(abort.signal)
  const pending = ['a', 'b', 'c', 'd', 'e', 'f'].map((url) => frames.get(url))
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(frames.get('a')).toBe(pending[0])
  releases.splice(0).forEach((done) => done())
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6))
  releases.splice(0).forEach((done) => done())
  await Promise.all(pending)
  expect(peak).toBe(3)
  abort.abort()
})

it('evicts old compressed images when their combined byte budget is exhausted', async () => {
  const fetcher = vi.fn(() => Promise.resolve(new Response(new Blob(['123456']))))
  vi.stubGlobal('fetch', fetcher)
  const abort = new AbortController(),
    frames = new FrameImages(abort.signal, 8)
  await frames.get('a')
  await frames.get('b')
  await frames.get('a')
  expect(fetcher).toHaveBeenCalledTimes(3)
  abort.abort()
})

it('abort rejects queued work and never starts it after the owner has gone away', async () => {
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
          once: true,
        })
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const abort = new AbortController(),
    frames = new FrameImages(abort.signal)
  const result = Promise.allSettled(['a', 'b', 'c', 'd', 'e'].map((url) => frames.get(url)))
  abort.abort()
  expect((await result).every((value) => value.status === 'rejected')).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(3)
})
