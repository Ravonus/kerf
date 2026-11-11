import { errored, need, onDisk, short } from './common.mjs'

export async function audioFile({ bytes, name, stem }, o, encode) {
  const opus = encode['audio/opus']
  const aac = encode['audio/aac']
  if (!aac) return { asset: null, files: [], diagnostics: [need(name, 'audio/aac')] }
  try {
    return await onDisk(name, bytes, async (source) => {
      const info = await aac.info(source)
      if (!info.audio)
        return {
          asset: null,
          files: [],
          diagnostics: [
            { code: 'M018', severity: 'error', message: `${name} has no audio track.` },
          ],
        }
      const under = (limit) => !info.audio.bitrate || info.audio.bitrate <= limit
      const sets = []
      for (const [enc, codec, limit] of [
        [opus, 'opus', 96_000],
        [aac, 'aac', 128_000],
      ]) {
        if (!enc || !(await enc.encoderName())) continue
        const encoded = await enc.encode(source, {
          copy: info.audio.codec === codec && under(limit),
        })
        const type = `${enc.ext === 'webm' ? 'audio/webm' : 'audio/mp4'}; codecs="${(await onDisk(`x.${enc.ext}`, encoded, (f) => enc.info(f))).audio.string}"`
        sets.push({ type, name: `${stem}-${short(encoded)}.${enc.ext}`, bytes: encoded })
      }
      const last = sets.at(-1)
      return {
        asset: {
          kind: 'audio',
          src: last.name,
          width: 0,
          height: 0,
          type: 'audio/mp4',
          name,
          quality: 'fixed',
          duration: info.duration,
          audio: true,
          sources: sets.map((s) => ({ type: s.type, srcset: `${s.name} 1w` })),
        },
        files: sets.map((s) => ({ name: s.name, bytes: s.bytes })),
        diagnostics: [],
      }
    })
  } catch (e) {
    return errored(name, e)
  }
}
