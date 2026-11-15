// Segment the selected native movie without another lossy encode or an eager whole-file browser download.
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

function identical(before, after) {
  const shift = after.timeline[0][0] - before.timeline[0][0]
  return (
    before.video === after.video &&
    before.audio === after.audio &&
    before.width === after.width &&
    before.height === after.height &&
    before.timeline.length === after.timeline.length &&
    (before.audioStart === null
      ? after.audioStart === null
      : Math.abs(after.audioStart - before.audioStart - shift) < 0.002) &&
    before.timeline.every((frame, index) =>
      frame.every(
        (value, part) =>
          Math.abs(after.timeline[index][part] - value - (part === 0 ? shift : 0)) < 0.00051,
      ),
    )
  )
}

/** Packet-preserving HLS for H.264/AAC, qualified against every source frame and encoded audio sample. */
export function streamCopy({ run, ffmpeg, input, fingerprint }) {
  return async (file, { directory, seconds = 2 }) => {
    if (!(seconds >= 0.5 && seconds <= 10))
      throw new TypeError('Segment duration must be 0.5–10 seconds')
    const before = await fingerprint(file)
    if (before.codec !== 'h264' || (before.audioCodec && before.audioCodec !== 'aac'))
      throw new Error('Stream copy requires an H.264 movie with optional AAC audio')
    directory = resolve(directory)
    await mkdir(directory, { recursive: true })
    if ((await readdir(directory)).length) throw new Error('Stream output directory must be empty')
    const playlist = join(directory, 'index.m3u8')
    await run(ffmpeg, [
      '-v',
      'error',
      '-nostdin',
      ...input(file),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c',
      'copy',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-f',
      'hls',
      '-hls_time',
      String(seconds),
      '-hls_playlist_type',
      'vod',
      '-hls_segment_type',
      'fmp4',
      '-hls_fmp4_init_filename',
      'init.mp4',
      '-hls_segment_filename',
      join(directory, 'segment-%05d.m4s'),
      '-hls_flags',
      'independent_segments',
      playlist,
    ])
    const after = await fingerprint(playlist)
    if (!identical(before, after))
      throw new Error('Stream copy changed encoded samples or presentation timing')
    const text = await readFile(playlist, 'utf8')
    if (!text.includes('#EXT-X-ENDLIST')) throw new Error('The HLS stream is incomplete')
    const names = [
      'index.m3u8',
      'init.mp4',
      ...text.split('\n').filter((line) => /^segment-\d+\.m4s$/.test(line)),
    ]
    const files = await Promise.all(
      names.map(async (name) => ({ name, bytes: (await stat(join(directory, name))).size })),
    )
    return {
      playlist: 'index.m3u8',
      files,
      verification: {
        video: 'identical encoded samples',
        audio: before.audio ? 'identical encoded samples' : 'absent',
        timing: 'complete',
        frames: before.timeline.length,
        segments: files.length - 2,
        largestSegmentBytes: Math.max(
          ...files.filter((item) => item.name.endsWith('.m4s')).map((item) => item.bytes),
        ),
      },
    }
  }
}
