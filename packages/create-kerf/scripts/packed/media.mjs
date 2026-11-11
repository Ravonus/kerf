import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fnId } from '../../../start/src/vite.mjs'

/** The add path a user takes, three sources, and a page that renders them. */
export async function mediaApp(app, kerf, log, sh) {
  await sh(kerf, ['add', 'media'], app)
  await sh(kerf, ['add', 'media-ffmpeg'], app)
  await sh('pnpm', ['add', 'sharp@0.35.5'], app) // the media route loads it at run time (M017)
  const config = join(app, 'kerf.config.ts')
  writeFileSync(
    config,
    readFileSync(config, 'utf8').replace(
      /media\(\)/,
      "media({ encoder: 'compatible', quality: { scorer: 'none' }, video: { widths: [160, 320] } })",
    ),
  )
  await sh(kerf, ['plugins', 'approve', '--all'], app)
  log('kerf add media, media-ffmpeg, approve: pass')
  const ff = (...args) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], app)
  await ff(
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:d=2:r=15',
    '-vf',
    'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none',
    'src/routes/loop.gif',
  )
  await ff(
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=640x360:d=3:r=24',
    '-f',
    'lavfi',
    '-i',
    'sine=f=440:d=3',
    '-c:v',
    'ffv1',
    '-c:a',
    'pcm_s16le',
    'src/routes/clip.mov',
  )
  await ff('-f', 'lavfi', '-i', 'sine=f=330:d=1', 'src/routes/tone.wav')
  await ff(
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=640x360:d=1',
    '-frames:v',
    '1',
    '-q:v',
    '2',
    'src/routes/hero.jpg',
  )
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1', '-frames:v', '1', 'src/routes/card.png')
  writeMediaRoutes(app)
}

function writeMediaRoutes(app) {
  mkdirSync(join(app, 'src/server'), { recursive: true })
  writeFileSync(
    join(app, 'src/server/upload.ts'),
    `import { mutation, query } from '@kerf-js/start'
import { z } from '@kerf-js/start/media'

let last: unknown = null
export const lastUpload = query({ tags: ['upload'], output: z.media().nullable(), run: () => last as any })
export const upload = mutation({ input: z.object({ file: z.file() }), invalidates: ['upload'], run: async ({ input, ctx }) => (last = await ctx.media.ingest(input.file)) })
`,
  )
  writeFileSync(
    join(app, 'src/routes/media.tsx'),
    `import { Media, timeline } from '@kerf-js/core/media'
import hero from './hero.jpg?media'
import card from './card.png?media'
import loop from './loop.gif?media'
import clip from './clip.mov?media'
import tone from './tone.wav?media'

export default function Page() {
  const t = timeline(clip, { cues: { half: 1.5 } })
  return (
    <main style="display:grid;gap:var(--veneer-space-related);justify-items:start">
      <Media src={hero} alt="A test card" width="320px" data-save="still" />
      <Media src={card} alt="A flat test card" width="320px" data-save="graphic" />
      <Media src={loop} alt="A test card moving" data-save="gif" />
      <Media src={clip} alt="A test card with a tone" timeline={t} data-save="video" />
      <Media src={tone} alt="A 330 Hz tone" />
      <button onClick={() => { t.currentTime.value = 1; t.playing.value = true }}>Play</button>
      <output>{t.cue.value ?? 'none'}</output>
    </main>
  )
}
`,
  )
}

/** What a browser would fetch: each file there, in the codec it says, by ranges, and cacheable for good. */
export async function mediaServed(app, port, log) {
  const base = `http://localhost:${port}`
  const html = await (await fetch(`${base}/media`)).text()
  const sources = [...html.matchAll(/<source[^>]* src="([^"]+)"[^>]* type="([^"]+)"/g)].map(
    (m) => ({ url: m[1], type: m[2].replaceAll('&quot;', '"') }),
  )
  if (!html.includes('<video') || !html.includes('<audio'))
    throw new Error('media: no <video> or <audio> in the page')
  const wanted = {
    'video/mp4': /h264/,
    'video/webm': /av1|vp9/,
    'audio/webm': /opus/,
    'audio/mp4': /aac/,
  }
  for (const need of ['loop', 'clip', 'tone'])
    if (!sources.some((s) => s.url.includes(need))) throw new Error(`media: no source for ${need}`)
  for (const { url, type } of sources) {
    const whole = await fetch(base + url)
    if (whole.status !== 200) throw new Error(`media: ${url} answered ${whole.status}`)
    if (!/immutable/.test(whole.headers.get('cache-control') ?? ''))
      throw new Error(`media: ${url} isn't cached for good: ${whole.headers.get('cache-control')}`)
    const file = join(app, 'probe.bin')
    writeFileSync(file, Buffer.from(await whole.arrayBuffer()))
    const codecs = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    )
    if (!wanted[type.split(';')[0]].test(codecs))
      throw new Error(`media: ${url} says ${type} and holds ${codecs}`)
    const part = await fetch(base + url, { headers: { range: 'bytes=0-99' } })
    if (part.status !== 206 || (await part.arrayBuffer()).byteLength !== 100)
      throw new Error(`media: ${url} ignores ranges: ${part.status}`)
  }
  log(`${sources.length} encoded files served: pass`)

  // An upload a build never saw: it answers straight away, and each rung comes off the media route by ranges.
  const body = new FormData()
  body.set('$fn', fnId('upload', 'src/server/upload.ts'))
  body.set(
    'file',
    new File([readFileSync(join(app, 'src/routes/clip.mov'))], 'clip.mov', {
      type: 'video/quicktime',
    }),
  )
  const posted = await fetch(`${base}/media`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: base },
    body,
  })
  if (posted.status !== 303) throw new Error(`media: the upload answered ${posted.status}`)
  const record = (
    await (await fetch(`${base}/_kerf/fn/${fnId('lastUpload', 'src/server/upload.ts')}`)).json()
  ).v
  if (record?.kind !== 'video' || !record.poster)
    throw new Error(`media: the upload's record is ${JSON.stringify(record)}`)
  const part = await fetch(base + record.src, { headers: { range: 'bytes=0-99' } })
  if (part.status !== 206)
    throw new Error(`media: the uploaded video ignores ranges: ${part.status}`)
  log('video upload encoded and served: pass')
}
