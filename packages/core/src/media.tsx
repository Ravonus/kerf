// @kerf/core/media: <Media> and the record a `?media` import evaluates to (research 15 §7, research 26 §2). No encoder and
// no IO here: @kerf/core/vite builds the record (with @kerf/media's `media.build` provider, or a header probe
// without one), and this renders it with dimensions, a placeholder, `srcset` and `sizes`, so nothing shifts. Video and
// audio records come from @kerf/media-ffmpeg. The swap runtime is a chunk only a compatible copy loads.

import { onMount, untrack } from './index'
import type { Timeline } from './media-timeline'

export { timeline, type Timeline, type TimelineOptions } from './media-timeline'

/** What `import x from './x.jpg?media'` gives you. */
export interface MediaAsset {
  /** photo: lossy sources; graphic: PNG/GIF/WebP stills; vector: SVG; video also covers a GIF turned into video. */
  kind: 'photo' | 'graphic' | 'vector' | 'video' | 'audio'
  /** The compatible fallback at the largest width. */
  src: string
  /** Intrinsic size, after EXIF orientation. */
  width: number
  height: number
  /** MIME type of `src`. */
  type: string
  /** Efficient formats first (image/avif), the fallback last. Empty when the original is the only file. */
  sources: { type: string; srcset: string }[]
  /** #rrggbb */
  dominant?: string
  /** A tiny WebP shown until the image paints: a data: URL, or a file URL with `placeholder: 'file'`. */
  placeholder?: string
  /** The source file name (M007: `alt` must say more than this). */
  name: string
  /** How the quality was chosen: an SSIMULACRA2 target, or fixed encoder settings when no scorer was available. */
  quality?: 'ssimulacra2' | 'fixed' | 'original'
  /** Video: the still shown until it plays. */
  poster?: string
  /** Video and audio: seconds. */
  duration?: number
  /** Video: it has a sound track. */
  audio?: boolean
  /** Video made from a GIF: it autoplays muted, as the GIF did. */
  animated?: boolean
  /** The GIF's loop count: 0 is forever. */
  loop?: number
  /** `encoder: 'compatible'`: the file a save should give. */
  copy?: { src: string; type: string; bytes?: number; ratio?: number }
  swap?: 'intent' | 'idle' | 'never'
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
  /** Video: 'always' keeps a GIF moving under `prefers-reduced-motion`. */
  motion?: 'auto' | 'always'
  [attr: string]: unknown
}

/** Veneer's phone breakpoint: under 600 px a fractional width is the full viewport. */
const PHONE = '(max-width: 599px)'

/**
 * The `sizes` attribute: an explicit one, else from `width`, else `auto` for lazy images (the browser uses the
 * laid-out width; `100vw` where `auto` isn't supported) and `100vw` for eager ones (M010 flags that case).
 */
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

/** Inline style: the box (aspect ratio), the placeholder behind a photo, the focal point. */
export function mediaStyle(
  a: MediaAsset,
  focus?: [number, number],
  fit?: 'cover' | 'contain',
): string {
  let s = `aspect-ratio:${a.width}/${a.height};max-inline-size:100%;block-size:auto`
  // Only photos: a placeholder would show through a transparent graphic once it loads.
  if (a.kind === 'photo' && (a.placeholder || a.dominant))
    s += `;background:${a.dominant ?? ''}${a.placeholder ? ` url(${a.placeholder})` : ''} center/cover no-repeat`
  if (fit) s += `;object-fit:${fit}`
  if (focus) s += `;object-position:${Math.round(focus[0] * 100)}% ${Math.round(focus[1] * 100)}%`
  return s
}

const fallbackSrcset = (a: MediaAsset) => a.sources.at(-1)?.srcset

/**
 * `<source>` has no `srcset` on `<video>`: one per codec and width, efficient codecs first, each width behind a `media`
 * query at half its pixels (a 2× screen), the largest with none. The browser plays the first it can and that matches.
 */
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
  motion,
  controls,
  ...rest
}: MediaProps) {
  let el!: HTMLVideoElement
  onMount(() => {
    if (timeline) timeline.bind(el)
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

/**
 * One source, everything automatic: `<Media src={hero} alt="…" />`. Renders `<picture>` with the efficient formats
 * when the asset has them (AVIF isn't in every engine Kerf targets: iOS 15), else one `<img>`.
 */
export function Media(props: MediaProps) {
  return untrack(() =>
    props.src.kind === 'video' || props.src.kind === 'audio' ? timed(props) : still(props),
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
