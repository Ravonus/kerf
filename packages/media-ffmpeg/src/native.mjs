// Automatic playback candidates retain encoded audio and qualify timing before the build compares bytes.
import { createHash } from 'node:crypto'

const audioIn = {
  mp4: new Set(['aac', 'mp3', 'alac']),
  webm: new Set(['opus', 'vorbis']),
}

/** Optional provider capability for measured native playback and packet-preserving container changes. */
export function nativeVideo({ run, ffmpeg, ffprobe, input, output, spec, key, encoderName }) {
  const ext = key === 'video/vp9' ? 'webm' : 'mp4'
  return {
    ext,
    type: `video/${ext}`,
    acceptsAudio: (codec) => !codec || audioIn[ext].has(codec),
    /** @param {string} file
     * @param {{ knob?: number, copy?: boolean, seconds?: number }} recipe */
    async encode(file, { knob, copy = false, seconds } = {}) {
      const name = await encoderName()
      if (!copy && !name) throw new Error(`No encoder for ${key}`)
      return output(ext, [
        ...input(file),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:a',
        'copy',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        ...(seconds ? ['-t', String(seconds)] : []),
        ...(copy
          ? ['-c:v', 'copy']
          : [
              '-vf',
              'format=yuv420p',
              '-fps_mode',
              'passthrough',
              '-c:v',
              name,
              '-crf',
              String(knob),
              ...spec.args[name],
              '-threads',
              '4',
              ...(name === 'libsvtav1' ? ['-svtav1-params', 'lp=4'] : []),
            ]),
        ...(ext === 'mp4' ? ['-movflags', '+faststart'] : ['-cues_to_front', '1']),
        '-f',
        ext,
      ])
    },
    fingerprint: fingerprint({ run, ffmpeg, ffprobe, input }),
  }
}

function fingerprint({ run, ffmpeg, ffprobe, input }) {
  return async (file) => {
    const { stdout } = await run(ffprobe, [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      file,
    ])
    const { streams = [], format = {} } = JSON.parse(String(stdout))
    const video = streams.filter((stream) => stream.codec_type === 'video'),
      audio = streams.filter((stream) => stream.codec_type === 'audio')
    if (video.length !== 1 || audio.length > 1 || streams.length !== video.length + audio.length)
      throw new Error('Automatic video optimization retains sources with additional tracks')
    const packets = async (track) => {
      const result = await run(ffmpeg, [
        '-v',
        'error',
        ...input(file),
        '-map',
        `0:${track}:0`,
        '-c',
        'copy',
        '-f',
        'hash',
        '-hash',
        'sha256',
        'pipe:1',
      ])
      return String(result.stdout).trim()
    }
    const frames = await run(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_frames',
      '-show_entries',
      'frame=best_effort_timestamp_time,duration_time,pkt_duration_time',
      '-of',
      'json',
      file,
    ])
    const timeline = JSON.parse(String(frames.stdout)).frames.map((frame) => [
      Number(frame.best_effort_timestamp_time),
      Number(frame.duration_time ?? frame.pkt_duration_time),
    ])
    if (!timeline.length || timeline.some((frame) => !frame.every(Number.isFinite)))
      throw new Error('The native video has incomplete frame timing')
    return {
      video: await packets('v'),
      audio: audio.length ? await packets('a') : null,
      width: video[0].width,
      height: video[0].height,
      timeline,
      duration: Number(format.duration),
      audioStart: audio.length ? Number(audio[0].start_time ?? 0) : null,
      sha256: createHash('sha256').update(JSON.stringify(timeline)).digest('hex'),
    }
  }
}
