import type { MediaAsset } from './media'
import { initialMediaLevel, mediaConnection } from './media-network'
function rendition(element: HTMLElement, size: { width: number; height: number }, srcset: string) {
  const levels = srcset.split(', ').map((entry) => {
    const [url, rung] = entry.split(' '),
      width = Number.parseInt(rung ?? '') || size.width
    return { url: url!, width, height: Math.round((width * size.height) / size.width) }
  })
  return levels[
    initialMediaLevel(
      levels,
      element.clientWidth || size.width,
      element.clientHeight || size.height,
      mediaConnection(),
      devicePixelRatio,
    )
  ]!
}
/** Choose a supported display-sized source before any playback request. */
export function mediaVideoSource(video: HTMLVideoElement, asset: MediaAsset) {
  const source = asset.sources.find((s) => video.canPlayType(s.type))
  return rendition(video, asset, source?.srcset ?? `${asset.src} ${asset.width}w`)
}
/** Select the exact still at display resolution without bandwidth-driven image downshifts. */
export async function prepareMediaPoster(
  video: HTMLVideoElement,
  asset: MediaAsset,
  image: HTMLImageElement,
  disposed: () => boolean,
) {
  const frame = asset.firstFrame
  if (!frame) return
  image.src = rendition(
    video,
    frame,
    frame.sources.at(-1)?.srcset ?? `${frame.src} ${frame.width}w`,
  ).url
  await image.decode().catch(() => {})
  if (!disposed() && image.naturalWidth) video.poster = image.currentSrc || image.src
}
