// Render optimized media records with native layout, playback and original-file save metadata.
import { onMount, onCleanup, untrack } from './index'
import type { Timeline } from './media-timeline'

import type { FrameSequence, MediaPlayback } from './media-frame-types'
import { mediaStyle } from './media-style'
import { framed } from './media-frame-view'
export { mediaStyle } from './media-style'
export { timeline, type Timeline, type TimelineOptions } from './media-timeline'
export type { FrameSequence, FrameChunk, FramePatch, MediaPlayback } from './media-frame-types'
export { prepareMediaSave, type PreparedMediaSave, type MediaSaveOptions } from './media-save'

/** What `import x from './x.jpg?media'` gives you. */
export interface MediaAsset {
  /** photo: lossy sources; graphic: PNG/GIF/WebP stills; vector: SVG; video also covers a GIF turned into video. */
  kind: 'photo' | 'graphic' | 'vector' | 'video' | 'audio'
  /** The compatible fallback at the largest width. */
  src: string
  /** Intrinsic size, after EXIF orientation. */
  width: number
  height: number
  type: string
  /** Efficient formats first (image/avif), the fallback last. Empty when the original is the only file. */
  sources: { type: string; srcset: string }[]
  dominant?: string
  /** A tiny WebP shown until the image paints: a data: URL, or a file URL with `placeholder: 'file'`. */
  placeholder?: string
  /** The source file name (M007: `alt` must say more than this). */
  name: string
  /** How the quality was chosen: an SSIMULACRA2 target, or fixed encoder settings when no scorer was available. */
  quality?: 'ssimulacra2' | 'fixed' | 'original'
  /** Video: the still shown until it plays. */
  poster?: string
  duration?: number
  audio?: boolean
  /** Video made from a GIF: it autoplays muted, as the GIF did. */
  animated?: boolean
  /** The GIF's loop count: 0 is forever. */
  loop?: number
  /** `encoder: 'compatible'`: the file a save should give. */
  copy?: { src: string; type: string; bytes?: number; ratio?: number }
  swap?: 'intent' | 'idle' | 'never' | 'manual'
  /** The immutable source, requested only for original-file saving. */
  original?: { src: string; type: string; name: string; bytes: number }
  /** Independent image chunks, decoded just ahead of the current frame. */
  frames?: FrameSequence
}

/** `<Media>`'s props: the asset, how it's described and framed, and anything else for the element. */
export interface MediaProps {
  src: MediaAsset
  /** Required. Describe what the image shows; for purely visual media pass `alt=""` with `decorative` (M007). */
  alt: string
  decorative?: boolean
  /** The one LCP image of the route (M008/M009): eager, `fetchpriority="high"`. */
  priority?: boolean
  /** The rendered width for `sizes`: a fraction of the viewport (`"1/3"`), or a CSS length (`"240px"`, `"50vw"`). */
  width?: string
  /** Escape hatch: an explicit `sizes` (wins over `width`). */
  sizes?: string
  /** Focal point, 0–1 from the top left: becomes `object-position`. */
  focus?: [number, number]
  fit?: 'cover' | 'contain'
  /** Video and audio: sync code to it with `timeline()`. */
  timeline?: Timeline
  /** Native media and image-frame playback expose the same control contract. */
  playback?: (player: MediaPlayback) => void
  /** Video: 'always' keeps a GIF moving under `prefers-reduced-motion`. */
  motion?: 'auto' | 'always'
  [attr: string]: unknown
}

/** Veneer's phone breakpoint: under 600 px a fractional width is the full viewport. */
const PHONE = '(max-width: 599px)'

/** Responsive sizes from an explicit width, or native lazy-image measurement. */
export function mediaSizes(
  width: string | undefined,
  sizes: string | undefined,
  lazy: boolean,
): string {
  if (sizes) return sizes
  if (width) {
    const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(width)
    if (frac)
      return `${PHONE} 100vw, ${Math.round((Number(frac[1]) / Number(frac[2])) * 10000) / 100}vw`
    // oxlint-disable-next-line unicorn/prefer-string-starts-ends-with -- the regex is the shorter bytes in every page with a <Media>
    return /vw$/.test(width) ? `${PHONE} 100vw, ${width}` : width
  }
  return lazy ? 'auto, 100vw' : '100vw'
}

const fallbackSrcset = (a: MediaAsset) => a.sources.at(-1)?.srcset

/** Native timed sources select codecs and widths through standard media queries. */
export function timedSources(
  a: MediaAsset,
): { src: string; type: string; media?: string | undefined }[] {
  return a.sources.flatMap((s) => {
    const rungs = s.srcset.split(', ').map((r) => r.split(' '))
    return rungs.map(([src, w], i) =>
      i < rungs.length - 1
        ? { src: src!, type: s.type, media: `(max-width: ${Math.round(parseInt(w!) / 2)}px)` }
        : { src: src!, type: s.type },
    )
  })
}

function timed({
  src,
  alt,
  decorative,
  priority,
  focus,
  fit,
  timeline,
  playback,
  motion,
  controls,
  ...rest
}: MediaProps) {
  let el!: HTMLVideoElement
  onMount(() => {
    if (timeline) onCleanup(timeline.bind(el))
    playback?.(el)
    if (
      src.animated &&
      motion !== 'always' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      el.pause()
    if (src.loop && src.loop > 1) {
      let left = src.loop - 1
      el.addEventListener('ended', () => {
        if (left-- > 0) void el.play()
      })
    }
    if (src.copy) void import('./media-swap').then((m) => m.attach(el, src))
  })
  const sources = timedSources(src).map((s) => (
    <source key={s.src} src={s.src} type={s.type} media={s.media} />
  ))
  if (src.kind === 'audio')
    return (
      <audio
        ref={(n: HTMLElement) => (el = n as HTMLVideoElement)}
        controls
        preload={priority ? 'auto' : 'metadata'}
        aria-label={decorative ? undefined : alt}
        {...rest}
      >
        {sources}
      </audio>
    )
  const moving = !!src.animated
  const video = (
    <video
      ref={(n: HTMLVideoElement) => (el = n)}
      poster={src.poster}
      width={src.width}
      height={src.height}
      role={moving ? 'img' : undefined}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative ? 'true' : undefined}
      autoplay={moving}
      muted={moving}
      loop={moving && !src.loop}
      playsinline
      disablepictureinpicture={moving}
      controls={controls ?? (!moving || (src.duration ?? 0) > 5)}
      preload={priority || moving ? 'auto' : 'none'}
      style={mediaStyle({ ...src, kind: 'photo' }, focus, fit)}
      {...rest}
    >
      {sources}
    </video>
  )
  return src.copy ? (
    <span style="position:relative;display:inline-block;max-inline-size:100%">{video}</span>
  ) : (
    video
  )
}

/** Render the complete optimized asset, including its optional frame stream. */
export function Media(props: MediaProps) {
  return untrack(() =>
    props.src.frames
      ? framed(props)
      : props.src.kind === 'video' || props.src.kind === 'audio'
        ? timed(props)
        : still(props),
  )
}

function still({ src, alt, decorative, priority, width, sizes, focus, fit, ...rest }: MediaProps) {
  let el!: HTMLImageElement
  if (src.copy) onMount(() => void import('./media-swap').then((m) => m.attach(el, src)))
  const img = () => (
    <img
      ref={(n: HTMLImageElement) => (el = n)}
      src={src.src}
      srcset={fallbackSrcset(src)}
      sizes={src.sources.length ? mediaSizes(width, sizes, !priority) : undefined}
      width={src.width}
      height={src.height}
      alt={decorative ? '' : alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : undefined}
      decoding="async"
      style={mediaStyle(src, focus, fit)}
      {...rest}
    />
  )
  return (
    <>
      {src.sources.length > 1 ? (
        <picture>
          {src.sources.slice(0, -1).map((s) => (
            <source
              key={s.type}
              type={s.type}
              srcset={s.srcset}
              sizes={mediaSizes(width, sizes, !priority)}
            />
          ))}
          {img()}
        </picture>
      ) : (
        img()
      )}
    </>
  )
}
