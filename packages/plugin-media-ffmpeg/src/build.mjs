// media.encode@1 over ffmpeg (research 15 §3.3–3.4, §6.1). One encoder per key; `encode` takes a file and a recipe and
// gives the bytes back. The pipeline that decides what to encode is @weft-js/plugin-media's; here is only how.
//   Video: yuv420p, even dimensions, frames passed through with their own timestamps, so a GIF's delays survive.
//   Audio: Opus at 96 kbps, AAC-LC at 128 kbps; never dropped unless the recipe says so.
//   Metadata is stripped (phones write GPS into videos), and MP4 gets `moov` first and WebM its cues first.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const MP4 = ['-movflags', '+faststart', '-f', 'mp4']
const WEBM = ['-cues_to_front', '1', '-f', 'webm']
const OPUS = ['-c:a', 'libopus', '-b:a', '96k']
const AAC = ['-c:a', 'aac', '-b:a', '128k']

/** Encoder names in the order they're tried, the knob's range (a CRF: lower is better) and what goes with the video. */
const CODECS = {
  'video/av1': { names: ['libsvtav1', 'libaom-av1'], min: 20, max: 58, fixed: 35, ext: 'webm', mux: WEBM, audio: OPUS, args: { libsvtav1: ['-preset', '6'], 'libaom-av1': ['-cpu-used', '6', '-row-mt', '1', '-b:v', '0'] } },
  'video/vp9': { names: ['libvpx-vp9'], min: 20, max: 50, fixed: 33, ext: 'webm', mux: WEBM, audio: OPUS, args: { 'libvpx-vp9': ['-b:v', '0', '-row-mt', '1', '-cpu-used', '2', '-deadline', 'good'] } },
  'video/hevc': { names: ['libx265'], min: 16, max: 36, fixed: 26, ext: 'mp4', mux: MP4, audio: AAC, args: { libx265: ['-preset', 'medium', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'] } },
  'video/h264': { names: ['libx264'], min: 16, max: 34, fixed: 23, ext: 'mp4', mux: MP4, audio: AAC, args: { libx264: ['-preset', 'medium', '-profile:v', 'high'] } },
  'audio/opus': { names: ['libopus'], ext: 'webm', mux: WEBM, audio: OPUS },
  'audio/aac': { names: ['aac'], ext: 'm4a', mux: MP4, audio: AAC },
}

const missing = bin => Object.assign(new Error(`M019 ${bin} didn't run. Install ffmpeg (brew install ffmpeg, apt install ffmpeg), or give mediaFfmpeg({ binary }) its path.`), { code: 'M019' })

const names = new Map()
/** What this binary can encode: asked once per process. */
function encodersOf(bin) {
  if (!names.has(bin)) names.set(bin, exec(bin, ['-hide_banner', '-encoders'], { maxBuffer: 1 << 22 }).then(r => new Set(r.stdout.split('\n').map(l => l.trim().split(/\s+/)[1])), () => { throw missing(bin) }))
  return names.get(bin)
}

function fraction(text) {
  const [a, b = 1] = String(text).split('/').map(Number)
  return b ? a / b : 0
}

const AVC = { Baseline: '42c0', 'Constrained Baseline': '42c0', Main: '4d40', High: '6400' }
/** The `codecs` parameter for `<source type>`, from what ffprobe says the encode is. */
function codecString(s) {
  if (s.codec_name === 'h264') return `avc1.${AVC[s.profile] ?? '6400'}${Number(s.level).toString(16).padStart(2, '0')}`
  if (s.codec_name === 'av1') return `av01.0.${String(Math.max(s.level, 0)).padStart(2, '0')}M.08`
  if (s.codec_name === 'hevc') return `hvc1.1.6.L${s.level}.B0`
  if (s.codec_name === 'vp9') return 'vp9'
  if (s.codec_name === 'aac') return 'mp4a.40.2'
  return s.codec_name
}

/** The media.encode@1 provider for one codec key: `encode` runs ffmpeg on a file and a recipe, and gives the bytes back. */
export function createMediaEncode({ key, binary = 'system', probe, sha256, timeout = 600_000 }) {
  const spec = CODECS[key]
  if (!spec) throw new Error(`media.encode: no ffmpeg recipe for ${key}`)
  const ffmpeg = binary === 'system' ? 'ffmpeg' : binary
  const ffprobe = probe ?? (binary === 'system' ? 'ffprobe' : join(dirname(binary), 'ffprobe'))
  let pinned = !sha256

  async function run(bin, args) {
    if (!pinned) {
      const actual = createHash('sha256').update(readFileSync(ffmpeg)).digest('hex')
      if (actual !== sha256) throw Object.assign(new Error(`M019 ${ffmpeg} is not the pinned binary: sha256 ${actual}.`), { code: 'M019' })
      pinned = true
    }
    return exec(bin, args, { timeout, maxBuffer: 1 << 26, encoding: 'buffer' }).catch(error => {
      if (error.code === 'ENOENT') throw missing(bin)
      throw new Error(`${key}: ${bin} failed: ${String(error.stderr ?? error.message).trim().split('\n').slice(-3).join(' ')}`)
    })
  }

  /** ffmpeg writing one temporary file, which comes back as bytes. */
  async function output(ext, args) {
    const dir = mkdtempSync(join(tmpdir(), 'weft-ffmpeg-'))
    try {
      const file = join(dir, `out.${ext}`)
      await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args, file])
      return new Uint8Array(readFileSync(file))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const input = (file, loop) => ['-protocol_whitelist', 'file,pipe', ...(loop ? ['-ignore_loop', '0'] : []), '-i', file]
  const scale = width => `scale=${width ? `${width}:-2` : 'trunc(iw/2)*2:trunc(ih/2)*2'}:flags=lanczos,format=yuv420p`

  async function encoderName() {
    const have = await encodersOf(ffmpeg)
    return spec.names.find(n => have.has(n)) ?? null
  }

  return {
    key,
    /** Lowest and highest knob, and the setting used with no quality search. Lower is better. */
    knob: { min: spec.min, max: spec.max, fixed: spec.fixed, higherIsBetter: false },
    ext: spec.ext,
    /** The encoder this binary would use, or null when it wasn't built with one. */
    encoderName,
    /** Goes into the cache key. */
    versions: async () => ({ ffmpeg: String((await run(ffmpeg, ['-version'])).stdout).split('\n')[0], encoder: await encoderName() }),

    /** What a file is, from ffprobe. */
    async info(file) {
      const { stdout } = await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', file])
      const { streams = [], format = {} } = JSON.parse(String(stdout))
      const v = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
      const a = streams.find(s => s.codec_type === 'audio')
      const side = v?.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? 0
      const turned = Math.abs(side) % 180 === 90
      return {
        format: format.format_name,
        duration: Number(format.duration) || 0,
        video: v && {
          codec: v.codec_name, pix: v.pix_fmt, width: turned ? v.height : v.width, height: turned ? v.width : v.height,
          fps: fraction(v.avg_frame_rate), frames: Number(v.nb_read_frames ?? v.nb_frames) || undefined, string: codecString(v),
          hdr: ['smpte2084', 'arib-std-b67'].includes(v.color_transfer) || /1[02]le$/.test(v.pix_fmt ?? ''),
        },
        audio: a && { codec: a.codec_name, channels: a.channels, bitrate: Number(a.bit_rate) || undefined, string: codecString(a) },
      }
    },

    /** One frame as a PNG, for the poster and the quality search. */
    still: (file, { at = 0, width } = {}) => output('png', ['-ss', String(at), ...input(file), '-map', '0:v:0', '-frames:v', '1', ...(width ? ['-vf', `scale=${width}:-2:flags=lanczos`] : [])]),

    /**
     * @param {string} file
     * @param {{ knob?: number, width?: number, copy?: boolean, audio?: string | false, loopVideo?: boolean }} recipe
     *   `copy`: remux without re-encoding. `audio`: a file to mux in, or false to drop the source's own.
     */
    async encode(file, { knob, width, copy, audio, loopVideo } = {}) {
      const name = await encoderName()
      if (!name) throw Object.assign(new Error(`M019 ${ffmpeg} has no ${spec.names.join(' or ')} encoder for ${key}.`), { code: 'M019' })
      const common = ['-map_metadata', '-1', '-map_chapters', '-1']
      if (key.startsWith('audio/')) return output(spec.ext, [...input(file), ...common, '-map', '0:a:0', '-vn', ...(copy ? ['-c:a', 'copy'] : spec.audio), ...spec.mux])
      // `-shortest` overruns on a looping GIF by what the encoder has buffered, so the sound's length is set outright.
      const tracks = typeof audio === 'string'
        ? [...input(file, loopVideo), ...input(audio), '-map', '0:v:0', '-map', '1:a:0', '-t', String((await this.info(audio)).duration), ...spec.audio]
        : [...input(file), '-map', '0:v:0', ...(audio === false ? [] : ['-map', '0:a:0?', ...(copy ? ['-c:a', 'copy'] : spec.audio)])]
      const video = copy ? ['-c:v', 'copy'] : ['-vf', scale(width), '-fps_mode', 'passthrough', '-c:v', name, '-crf', String(knob ?? spec.fixed), ...spec.args[name]]
      return output(spec.ext, [...tracks, ...common, ...video, ...spec.mux])
    },
  }
}
