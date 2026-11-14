// The compatibility copy is prepared only when requested. A retained source always wins over a re-encode.
import type { MediaAsset } from './media'

/** A save result owns its optional object URL until released. */
export interface PreparedMediaSave {
  url: string
  name: string
  type: string
  bytes?: number
  original: boolean
  release(): void
}

/** Manual mode lets a large gallery supply its own progress UI without preparing every file. */
export interface MediaSaveOptions {
  signal?: AbortSignal
  /** Explicit conversion for generated media without a retained source. PNG is the lossless canvas format. */
  type?: 'image/png' | 'image/jpeg'
  onProgress?: (phase: 'checking' | 'decoding' | 'encoding' | 'ready') => void
}

/** A worker is per save, so cancel and completion release its decoder and canvas together. */
async function workerEncode(blob: Blob, type: 'image/png' | 'image/jpeg', signal?: AbortSignal) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  const worker = new Worker(new URL('./media-save.worker.ts', import.meta.url), { type: 'module' })
  let cancel: (() => void) | undefined
  try {
    return await new Promise<Blob>((resolve, reject) => {
      cancel = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      signal?.addEventListener('abort', cancel, { once: true })
      worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) =>
        event.data.blob
          ? resolve(event.data.blob)
          : reject(new Error(event.data.error ?? 'Image encoding failed'))
      worker.onerror = () => reject(new Error('The image encoder worker failed'))
      signal?.throwIfAborted()
      worker.postMessage({ blob, type })
    })
  } finally {
    if (cancel) signal?.removeEventListener('abort', cancel)
    worker.terminate()
  }
}

function encodedResult(blob: Blob, asset: MediaAsset, type: string): PreparedMediaSave {
  const url = URL.createObjectURL(blob)
  return {
    url,
    name: asset.name.replace(/\.[^.]+$/, '') + (type === 'image/jpeg' ? '.jpg' : '.png'),
    type,
    bytes: blob.size,
    original: false,
    release: () => URL.revokeObjectURL(url),
  }
}

async function pageEncode(input: Blob, type: 'image/png' | 'image/jpeg', signal?: AbortSignal) {
  const bitmap = await createImageBitmap(input)
  try {
    signal?.throwIfAborted()
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas encoding is unavailable')
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value)
          else reject(new Error('Image encoding failed'))
        },
        type,
        1,
      )
    })
  } finally {
    bitmap.close()
  }
}

async function originalResult(
  asset: MediaAsset,
  copy: NonNullable<MediaAsset['copy']>,
  options: MediaSaveOptions,
): Promise<PreparedMediaSave> {
  const { signal, onProgress } = options
  onProgress?.('checking')
  const response = await fetch(copy.src, { method: 'HEAD', ...(signal && { signal }) })
  if (!response.ok) throw new Error(`The original file is unavailable (${response.status})`)
  signal?.throwIfAborted()
  onProgress?.('ready')
  return {
    url: copy.src,
    name: asset.original?.name ?? asset.name,
    type: copy.type,
    ...(copy.bytes !== undefined && { bytes: copy.bytes }),
    original: !!asset.original,
    release() {},
  }
}

/** Original bytes when retained; otherwise a browser-encoded still, or the declared compatible copy. */
export async function prepareMediaSave(
  asset: MediaAsset,
  options: MediaSaveOptions = {},
): Promise<PreparedMediaSave> {
  const { signal, onProgress } = options
  signal?.throwIfAborted()
  const copy = asset.original ?? asset.copy
  if (copy && !options.type) return originalResult(asset, copy, options)
  if (
    asset.kind === 'video' ||
    asset.kind === 'audio' ||
    asset.type === 'image/gif' ||
    asset.animated
  )
    throw new Error(
      'Moving media needs its original or a declared compatible copy; a still export would lose frames or audio',
    )
  if (!(asset.width > 0 && asset.height > 0) || asset.width * asset.height > 16777216)
    throw new Error(
      'Image conversion exceeds the 16 megapixel browser budget; retain the original for saving',
    )
  onProgress?.('decoding')
  const source = asset.sources[0]?.srcset.split(', ').at(-1)?.split(' ')[0] ?? asset.src
  const response = await fetch(source, { ...(signal && { signal }) })
  if (!response.ok) throw new Error(`The image is unavailable (${response.status})`)
  const input = await response.blob(),
    type = options.type ?? 'image/png'
  onProgress?.('encoding')
  const encoded = await workerEncode(input, type, signal).catch((error) => {
    signal?.throwIfAborted()
    if (error instanceof Error && /unavailable|worker failed/.test(error.message)) return null
    throw error
  })
  const blob = encoded ?? (await pageEncode(input, type, signal))
  signal?.throwIfAborted()
  if (blob.type !== type) throw new Error(`This browser cannot encode ${type}`)
  onProgress?.('ready')
  return encodedResult(blob, asset, type)
}
