// A disposable codec job keeps image encoding off the page's input and animation thread.
/** The worker receives one still-image conversion and returns a Blob. */
export interface EncodeRequest {
  blob: Blob
  type: 'image/png' | 'image/jpeg'
}
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null
  postMessage(value: unknown): void
}
scope.onmessage = (event) => {
  void (async () => {
    const { blob, type } = event.data
    if (typeof OffscreenCanvas === 'undefined')
      throw new Error('Worker canvas encoding is unavailable')
    const image = await createImageBitmap(blob)
    try {
      const canvas = new OffscreenCanvas(image.width, image.height),
        context = canvas.getContext('2d')
      if (!context) throw new Error('Worker canvas encoding is unavailable')
      context.drawImage(image, 0, 0)
      const output = await canvas.convertToBlob({ type, quality: 1 })
      if (output.type !== type) throw new Error(`This browser cannot encode ${type}`)
      scope.postMessage({ blob: output })
    } finally {
      image.close()
    }
  })().catch((error) =>
    scope.postMessage({ error: error instanceof Error ? error.message : 'Image encoding failed' }),
  )
}
