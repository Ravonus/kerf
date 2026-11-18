import { state } from '@kerf-js/core'
import { For } from '@kerf-js/core/dom'
import { artworkImage } from '@kerf-js/veneer-core/visuals'
import { use } from '@kerf-js/veneer-core/kerf'
import { Frame } from './Layout'
import '@kerf-js/veneer-core/styles/components/progressive-picture.css'

/** A runtime image and optional preview in a fixed-ratio frame. */
export interface ProgressivePictureProps {
  src?: string | null | undefined
  preview?: string | null | undefined
  ratio?: Parameters<typeof Frame>[0]['ratio']
  alt: string
  fit?: 'cover' | 'contain' | undefined
  eager?: boolean | undefined
  fallback?: unknown
  /** Stable key for Start's shared layout transition. */
  transitionName?: string | undefined
  [attr: string]: unknown
}

/** Keep a preview in place while a runtime image loads and show a fallback if neither is available. */
export function ProgressivePicture({
  src,
  preview,
  ratio = 'square',
  alt,
  fit,
  eager,
  fallback,
  transitionName,
  ...rest
}: ProgressivePictureProps) {
  return (
    <Frame
      {...rest}
      ratio={ratio}
      data-kerf-shared={transitionName}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : 'true'}
    >
      <div data-scope="progressive-picture" data-fit={fit} aria-hidden="true">
        {fallback != null && <div data-part="picture-fallback">{fallback}</div>}
        <For each={preview && src !== preview ? [preview] : []} by={(url) => url}>
          {(url) => {
            const imageUrl = url()
            return <PictureLayer src={imageUrl} layer="preview" eager={eager} />
          }}
        </For>
        <For each={src ? [src] : []} by={(url) => url}>
          {(url) => {
            const imageUrl = url()
            return <PictureLayer src={imageUrl} layer="main" eager={eager} />
          }}
        </For>
      </div>
    </Frame>
  )
}

function PictureLayer({
  src,
  layer,
  eager,
}: {
  src: string
  layer: 'preview' | 'main'
  eager: boolean | undefined
}) {
  const status = state<'pending' | 'ready' | 'failed'>('pending')
  let node: HTMLImageElement | undefined
  use(
    artworkImage,
    () => node,
    () => ({
      allowAnalysis: false,
      report: () => {
        status.value = 'ready'
      },
      fail: () => {
        status.value = 'failed'
      },
    }),
  )
  return (
    <img
      ref={(image) => {
        node = image
      }}
      data-part="picture-layer"
      data-layer={layer}
      data-picture-status={status.value}
      alt=""
      src={src}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager && layer === 'main' ? 'high' : undefined}
    />
  )
}
