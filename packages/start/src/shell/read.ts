// Read a bounded UTF-8 line stream without treating a peer response as a document.
import { SHELL_BYTES, SHELL_FRAME_BYTES, invalid } from './wire'

export async function* frames(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const frame = new Uint8Array(SHELL_FRAME_BYTES - 1)
  let bytes = 0
  let size = 0
  const cancel = () => void reader.cancel().catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      bytes += value.length
      if (bytes > SHELL_BYTES) invalid()
      let start = 0
      while (start < value.length) {
        const end = value.indexOf(10, start)
        const part = value.subarray(start, end < 0 ? value.length : end)
        if (size + part.length > frame.length) invalid()
        frame.set(part, size)
        size += part.length
        if (end < 0) break
        signal.throwIfAborted()
        const parsed: unknown = JSON.parse(decoder.decode(frame.subarray(0, size)))
        yield parsed
        size = 0
        start = end + 1
      }
    }
    if (size) invalid()
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}
