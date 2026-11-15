// Decode one RGBA frame at a time, with no intermediate frame directory or whole-movie raw buffer.
import { spawn } from 'node:child_process'
import { extname } from 'node:path'

function timelineOf(frames) {
  if (!frames.length || frames.length > 120000)
    throw new Error('The frame stream is empty or exceeds 120,000 frames')
  const first = Number(frames[0].best_effort_timestamp_time)
  return {
    start: first,
    timeline: frames.map((frame, index) => {
      const time = Number(frame.best_effort_timestamp_time) - first,
        next = frames[index + 1],
        duration = next
          ? Number(next.best_effort_timestamp_time) - first - time
          : Number(frame.duration_time ?? frame.pkt_duration_time)
      if (!Number.isFinite(time) || !(duration > 0))
        throw new Error('The frame stream has unsupported or incomplete timing')
      return { time, duration }
    }),
  }
}

function rawProcess({ ffmpeg, file, timeout, signal, stream }) {
  signal?.throwIfAborted()
  const child = spawn(
    ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      file,
      '-map',
      `0:v:${stream}`,
      '-an',
      '-fps_mode',
      'passthrough',
      '-threads',
      '2',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let errorText = '',
    finished = false,
    stopping = false,
    killTimer
  child.stderr.on('data', (value) => {
    errorText = (errorText + value).slice(-2048)
  })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      finished = true
      clearTimeout(killTimer)
      if (code === 0) resolve()
      else reject(new Error(`Frame decode failed: ${errorText}`))
    })
  })
  void done.catch(() => {})
  const stop = () => {
      if (finished || stopping) return
      stopping = true
      child.stdout.destroy()
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 250)
      killTimer.unref()
    },
    timer = setTimeout(stop, timeout)
  signal?.addEventListener('abort', stop, { once: true })
  return {
    child,
    done,
    async close() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      if (!finished) stop()
      await done.catch(() => {})
    },
  }
}

async function* pixels({ ffmpeg, file, timeout, signal, timeline, stream }, { width, height }) {
  const size = width * height * 4
  if (!Number.isSafeInteger(size) || size < 4 || size > 64 * 1024 * 1024)
    throw new Error('Frame geometry exceeds the 16 megapixel decoding budget')
  const process = rawProcess({ ffmpeg, file, timeout, signal, stream })
  let buffer = Buffer.allocUnsafe(size),
    used = 0,
    count = 0
  try {
    for await (const block of process.child.stdout) {
      signal?.throwIfAborted()
      for (let offset = 0; offset < block.length;) {
        const length = Math.min(size - used, block.length - offset)
        block.copy(buffer, used, offset, offset + length)
        used += length
        offset += length
        if (used === size) {
          if (count >= timeline.length)
            throw new Error('Decoded frame count exceeds the source timeline')
          yield { ...timeline[count++], rgba: buffer }
          buffer = Buffer.allocUnsafe(size)
          used = 0
        }
      }
    }
    await process.done
    if (used || count !== timeline.length)
      throw new Error('Decoded frames do not match the complete source timeline')
  } finally {
    await process.close()
  }
}

/** The encoder provider's complete frame source, with authored times and a bounded process lifetime. */
export function frameReader({ ffmpeg, ffprobe, run, timeout }) {
  return async (file, { signal, stream: requested } = {}) => {
    await run(ffmpeg, ['-version'])
    const stream = requested ?? (await sequenceTrack(file, ffprobe, run))
    const result = await run(ffprobe, [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-select_streams',
      `v:${stream}`,
      '-show_frames',
      '-show_entries',
      'frame=best_effort_timestamp_time,duration_time,pkt_duration_time',
      '-of',
      'json',
      file,
    ])
    const { frames = [] } = JSON.parse(String(result.stdout)),
      data = timelineOf(frames)
    return {
      ...data,
      read: (dimensions) =>
        pixels({ ffmpeg, file, timeout, signal, stream, timeline: data.timeline }, dimensions),
    }
  }
}

async function sequenceTrack(file, ffprobe, run) {
  if (extname(file).toLowerCase() !== '.avif') return 0
  const { stdout } = await run(ffprobe, [
    '-v',
    'error',
    '-protocol_whitelist',
    'file,pipe',
    '-select_streams',
    'v',
    '-show_streams',
    '-of',
    'json',
    file,
  ])
  const { streams = [] } = JSON.parse(String(stdout))
  let chosen = 0
  for (let index = 1; index < streams.length; index++)
    if (Number(streams[index].nb_frames) > Number(streams[chosen].nb_frames)) chosen = index
  return chosen
}
