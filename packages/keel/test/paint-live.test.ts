// The run-time path's pure half: a media record as a CSS image for a tile. Painting itself runs in the e2e, in Chrome.
import { describe, expect, it } from 'vitest'
import { cssImage } from '../src/paint-live'

const asset = {
  kind: 'graphic' as const,
  src: '/assets/paper-512-a.png',
  width: 512,
  height: 512,
  type: 'image/png',
  name: 'paper.png',
  sources: [
    { type: 'image/avif', srcset: '/assets/paper-320-a.avif 320w, /assets/paper-512-a.avif 512w' },
    { type: 'image/png', srcset: '/assets/paper-320-a.png 320w, /assets/paper-512-a.png 512w' },
  ],
}

describe('cssImage', () => {
  it("offers each format's widest file, efficient first", () => {
    expect(cssImage(asset)).toBe(
      'image-set(url("/assets/paper-512-a.avif") type("image/avif"), url("/assets/paper-512-a.png") type("image/png"))',
    )
  })

  it('uses `src` alone for a record with no sources, as a painted blob is', () => {
    expect(cssImage({ ...asset, src: 'blob:x', sources: [] })).toBe('url("blob:x")')
  })
})
