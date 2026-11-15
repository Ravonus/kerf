import { afterEach, expect, it, vi } from 'vitest'
import { prepareMediaSave, type MediaAsset } from '../src/media'
const image: MediaAsset = {
  kind: 'graphic',
  src: '/small.avif',
  type: 'image/avif',
  width: 100,
  height: 100,
  sources: [],
  name: 'drawing.png',
  original: { src: '/original.png', type: 'image/png', name: 'drawing.png', bytes: 1234 },
}
afterEach(() => vi.unstubAllGlobals())
it('does no transfer until requested and prepares the retained original without downloading or re-encoding it', async () => {
  const requests: { url: string; method: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options: RequestInit) => {
      requests.push({ url, method: options.method! })
      return Promise.resolve(new Response(null, { status: 200 }))
    }),
  )
  expect(requests).toEqual([])
  const prepared = await prepareMediaSave(image)
  expect(requests).toEqual([{ url: '/original.png', method: 'HEAD' }])
  expect(prepared).toMatchObject({
    url: '/original.png',
    name: 'drawing.png',
    type: 'image/png',
    bytes: 1234,
    original: true,
  })
  prepared.release()
})
it('a cancelled save starts no work and a missing original fails instead of substituting optimized bytes', async () => {
  const controller = new AbortController()
  controller.abort()
  const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })))
  vi.stubGlobal('fetch', fetcher)
  await expect(prepareMediaSave(image, { signal: controller.signal })).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
  await expect(prepareMediaSave(image)).rejects.toThrow('original file is unavailable')
})
it('moving media without its original cannot silently turn into one PNG frame', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const { original: _original, ...withoutOriginal } = image
  await expect(prepareMediaSave({ ...withoutOriginal, kind: 'video' })).rejects.toThrow(
    'lose frames or audio',
  )
  expect(fetch).not.toHaveBeenCalled()
})
