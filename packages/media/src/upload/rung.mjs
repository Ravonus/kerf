import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function createRung(dir, encode, sourceOf, flight, COMPATIBLE) {
  /** One rung, encoded once: the queue and a waiting request share the work, and the file lands whole or not at all. */
  return function rung(hash, meta, width, format) {
    const file = join(dir, hash, `${width}.${format}`)
    if (existsSync(file)) return readFileSync(file)
    const key = `${hash}/${width}.${format}`
    if (!flight.has(key)) {
      const work = (async () => {
        const audio = meta.kind === 'audio'
        const enc =
          encode[
            audio
              ? format === 'webm'
                ? 'audio/opus'
                : 'audio/aac'
              : format === 'webm'
                ? meta.webm
                : COMPATIBLE
          ]
        const copy = meta.keepTop === width && format === 'mp4'
        const bytes = await enc.encode(
          sourceOf(hash),
          audio ? {} : copy ? { copy } : { width, knob: enc.knob.fixed },
        )
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, bytes)
        renameSync(tmp, file)
        return bytes
      })().finally(() => flight.delete(key))
      flight.set(key, work)
    }
    return flight.get(key)
  }
}
