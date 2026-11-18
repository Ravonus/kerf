import { derived, state } from '@kerf-js/core'
import { For } from '@kerf-js/core/dom'
import { use } from '@kerf-js/veneer-core/kerf'
import { artworkImage, type CornerAnalysis } from '@kerf-js/veneer-core/visuals'
import './styles'
import '@kerf-js/veneer-core/styles/components/artwork-frame.css'

/** Image, fallback and optional measured corner treatment. */
export interface ArtworkFrameProps {
  src?: string | null | undefined
  alt: string
  fallback?: unknown
  allowAnalysis?: boolean | undefined
  /** Reports the displayed image's analysis, or null when analysis is unavailable or disabled. */
  onAnalysis?: ((analysis: CornerAnalysis | null) => void) | undefined
  fit?: 'cover' | 'contain' | undefined
  /** Auto fills transparent corners with a stable sample color and crops matte frames. */
  repair?: 'auto' | 'crop' | 'none' | undefined
  aspectRatio?: number | undefined
  loading?: 'eager' | 'lazy' | undefined
  /** Opt into CORS for a remote image with an explicit server grant. */
  crossorigin?: 'anonymous' | undefined
  imageClass?: string | undefined
  [attr: string]: unknown
}

/** Draw an image or a fallback. Corner treatment is opt-in and happens after image load. */
export function ArtworkFrame({
  src,
  alt,
  fallback,
  allowAnalysis,
  onAnalysis,
  fit,
  repair,
  aspectRatio,
  loading,
  crossorigin,
  imageClass,
  ...rest
}: ArtworkFrameProps) {
  const sources = derived(() => (src ? [src] : []))
  return (
    <div {...rest} data-scope="artwork-frame" data-fit={fit}>
      <div data-part="artwork-well" style={{ 'aspect-ratio': aspectRatio }}>
        <For each={sources.value} by={(url) => url}>
          {(url) => {
            const imageUrl = url()
            return (
              <ArtworkImage
                src={imageUrl}
                alt={alt}
                allowAnalysis={allowAnalysis}
                onAnalysis={onAnalysis}
                fit={fit}
                repair={repair}
                loading={loading}
                crossorigin={crossorigin}
                imageClass={imageClass}
                fallback={fallback}
              />
            )
          }}
        </For>
        {!src && <ArtworkFallback alt={alt}>{fallback}</ArtworkFallback>}
      </div>
    </div>
  )
}

type ImageProps = ArtworkFrameProps & { src: string }

function ArtworkImage(props: ImageProps) {
  const result = state<CornerAnalysis | null>(null)
  const failed = state(false)
  let node: HTMLImageElement | undefined
  use(
    artworkImage,
    () => node,
    () => ({
      allowAnalysis: !!props.allowAnalysis,
      report: (value: CornerAnalysis | null) => {
        result.value = value
        props.onAnalysis?.(value)
      },
      fail: () => {
        failed.value = true
      },
    }),
  )
  const treatment = () =>
    !props.allowAnalysis || props.repair === 'none' || !result.value?.shouldClip
      ? null
      : result.value
  const fill = () =>
    props.repair !== 'crop' && treatment()?.reason === 'transparent-corners'
      ? (treatment()?.repairColor ?? undefined)
      : undefined
  return (
    <>
      {failed.value ? (
        <ArtworkFallback alt={props.alt}>{props.fallback}</ArtworkFallback>
      ) : (
        <div data-part="artwork-image-layer" style={{ 'background-color': fill() }}>
          <img
            ref={(image) => {
              node = image
            }}
            alt={props.alt}
            crossorigin={props.crossorigin}
            src={props.src}
            loading={props.loading}
            decoding="async"
            class={props.imageClass}
            data-part="artwork-image"
            style={{ scale: fill() || props.fit === 'contain' ? undefined : treatment()?.scale }}
          />
        </div>
      )}
    </>
  )
}

function ArtworkFallback({ alt, children }: { alt: string; children?: unknown }) {
  return (
    <div
      data-part="artwork-fallback"
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : 'true'}
    >
      <div aria-hidden="true">{children}</div>
    </div>
  )
}
