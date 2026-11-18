import { analyzeArtworkCorners, type CornerAnalysis } from './artwork'

interface ArtworkImageOptions {
  allowAnalysis: boolean
  report: (result: CornerAnalysis | null) => void
  fail: () => void
}

/** Watch the displayed image itself, so analysis doesn't issue a second request. */
export function artworkImage(image: HTMLImageElement, options: ArtworkImageOptions) {
  let current = options
  let reported: string | undefined
  let disposed = false
  const loaded = () => {
    if (disposed || !image.naturalWidth) return
    const src = image.currentSrc || image.src
    if (reported === src) return
    reported = src
    const result = current.allowAnalysis ? readCorners(image, src) : null
    current.report(result)
  }
  const failed = () => {
    if (!disposed) current.fail()
  }
  const ready = () => {
    if (!image.complete) return
    if (image.naturalWidth) loaded()
    else if (image.getAttribute('src')) failed()
  }
  image.addEventListener('load', loaded)
  image.addEventListener('error', failed)
  // The binding checks a complete image after its template has applied its source.
  queueMicrotask(() => {
    if (!disposed) ready()
  })
  return {
    update(next: ArtworkImageOptions) {
      const changed = next.allowAnalysis !== current.allowAnalysis
      current = next
      if (changed) {
        reported = undefined
        ready()
      }
    },
    destroy() {
      disposed = true
      image.removeEventListener('load', loaded)
      image.removeEventListener('error', failed)
    },
  }
}

function readCorners(image: HTMLImageElement, src: string) {
  const doc = image.ownerDocument
  if (!readable(src, doc, image.crossOrigin)) return null
  const width = Math.min(96, image.naturalWidth)
  const height = Math.min(96, image.naturalHeight)
  if (width < 12 || height < 12) return null
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, width, height)
    return analyzeArtworkCorners(ctx.getImageData(0, 0, width, height))
  } catch {
    // A redirect or an unavailable CORS grant can taint the canvas. Keep displaying the image.
    return null
  }
}

function readable(src: string, doc: Document, cors: string | null) {
  try {
    const url = new URL(src, doc.baseURI)
    return (
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      url.origin === doc.location?.origin ||
      cors === 'anonymous'
    )
  } catch {
    return false
  }
}
