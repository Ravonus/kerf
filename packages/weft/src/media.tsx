// weft/media: <Media> and the record a `?media` import evaluates to (research 15 §7, research 26 §2). No encoder and
// no IO here: weft/vite builds the record (with @weft/plugin-media's `media.build` provider, or a header probe
// without one), and this renders it with dimensions, a placeholder, `srcset` and `sizes`, so nothing shifts.

/** What `import x from './x.jpg?media'` gives you. */
export interface MediaAsset {
  /** photo: lossy sources; graphic: PNG/GIF/WebP stills; vector: SVG. */
  kind: 'photo' | 'graphic' | 'vector'
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
  /** A tiny inline WebP (data: URL) shown until the image paints. */
  placeholder?: string
  /** The source file name (M007: `alt` must say more than this). */
  name: string
  /** How the quality was chosen: an SSIMULACRA2 target, or fixed encoder settings when no scorer was available. */
  quality?: 'ssimulacra2' | 'fixed' | 'original'
}

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
  [attr: string]: any
}

/** warp's phone breakpoint: under 600 px a fractional width is the full viewport. */
const PHONE = '(max-width: 599px)'

/**
 * The `sizes` attribute: an explicit one, else from `width`, else `auto` for lazy images (the browser uses the
 * laid-out width; `100vw` where `auto` isn't supported) and `100vw` for eager ones (M010 flags that case).
 */
export function mediaSizes(width: string | undefined, sizes: string | undefined, lazy: boolean): string {
  if (sizes) return sizes
  if (width) {
    const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(width)
    if (frac) return `${PHONE} 100vw, ${Math.round((Number(frac[1]) / Number(frac[2])) * 10000) / 100}vw`
    return /vw$/.test(width) ? `${PHONE} 100vw, ${width}` : width
  }
  return lazy ? 'auto, 100vw' : '100vw'
}

/** Inline style: the box (aspect ratio), the placeholder behind a photo, the focal point. */
export function mediaStyle(a: MediaAsset, focus?: [number, number], fit?: 'cover' | 'contain'): string {
  let s = `aspect-ratio:${a.width}/${a.height};max-inline-size:100%;block-size:auto`
  // Only photos: a placeholder would show through a transparent graphic once it loads.
  if (a.kind === 'photo' && (a.placeholder || a.dominant)) s += `;background:${a.dominant ?? ''}${a.placeholder ? ` url(${a.placeholder})` : ''} center/cover no-repeat`
  if (fit) s += `;object-fit:${fit}`
  if (focus) s += `;object-position:${Math.round(focus[0] * 100)}% ${Math.round(focus[1] * 100)}%`
  return s
}

const fallbackSrcset = (a: MediaAsset) => a.sources.at(-1)?.srcset

/**
 * One source, everything automatic: `<Media src={hero} alt="…" />`. Renders `<picture>` with the efficient formats
 * when the asset has them (AVIF isn't in every engine weft targets: iOS 15), else one `<img>`.
 */
export function Media({ src, alt, decorative, priority, width, sizes, focus, fit, ...rest }: MediaProps) {
  const img = () => (
    <img
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
          {src.sources.slice(0, -1).map(s => <source key={s.type} type={s.type} srcset={s.srcset} sizes={mediaSizes(width, sizes, !priority)} />)}
          {img()}
        </picture>
      ) : (
        img()
      )}
    </>
  )
}
