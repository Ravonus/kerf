// The packed-install gate: every package as a tarball in a fresh full-stack scaffold, so what's checked is what a
// consumer installs. The other suites link the workspace, where undeclared dependencies and TypeScript loaded by Node
// both work; under node_modules neither does.
//
//   node packages/create-weft/scripts/packed.mjs <empty-dir> [app]
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { scaffold } from '../src/index.mjs'
import { fnId } from '../../start/src/vite.mjs'
import { packAll, pin, pkgs } from './tarballs.mjs'

if (!process.argv[2]) throw new Error('usage: packed.mjs <empty-dir> [app]')
const root = resolve(process.argv[2])
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

const tarballs = packAll(join(root, 'tgz'))

/** The add path a user takes, three sources, and a page that renders them. */
function mediaApp(app, weft, log) {
  sh(weft, ['add', 'media'], app)
  sh(weft, ['add', 'media-ffmpeg'], app)
  sh('npm', ['install', '--silent', 'sharp@0.35.5'], app) // the media route loads it at run time (M017)
  const config = join(app, 'weft.config.ts')
  writeFileSync(config, readFileSync(config, 'utf8').replace(/media\(\)/, "media({ encoder: 'compatible', quality: { scorer: 'none' }, video: { widths: [160, 320] } })"))
  sh(weft, ['plugins', 'approve', '--all'], app)
  log('weft add media, media-ffmpeg, approve: pass')
  const ff = (...args) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], app)
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=2:r=15', '-vf', 'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none', 'src/routes/loop.gif')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=3:r=24', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', 'src/routes/clip.mov')
  ff('-f', 'lavfi', '-i', 'sine=f=330:d=1', 'src/routes/tone.wav')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=1', '-frames:v', '1', '-q:v', '2', 'src/routes/hero.jpg')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1', '-frames:v', '1', 'src/routes/card.png')
  mkdirSync(join(app, 'src/server'), { recursive: true })
  writeFileSync(join(app, 'src/server/upload.ts'), `import { mutation, query } from '@weft/start'
import { z } from '@weft/start/media'

let last: unknown = null
export const lastUpload = query({ tags: ['upload'], output: z.media().nullable(), run: () => last as any })
export const upload = mutation({ input: z.object({ file: z.file() }), invalidates: ['upload'], run: async ({ input, ctx }) => (last = await ctx.media.ingest(input.file)) })
`)
  writeFileSync(join(app, 'src/routes/media.tsx'), `import { Media, timeline } from 'weft/media'
import hero from './hero.jpg?media'
import card from './card.png?media'
import loop from './loop.gif?media'
import clip from './clip.mov?media'
import tone from './tone.wav?media'

export default function Page() {
  const t = timeline(clip, { cues: { half: 1.5 } })
  return (
    <main style="display:grid;gap:8px;justify-items:start">
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
`)
}

/** What a browser would fetch: each file there, in the codec it says, by ranges, and cacheable for good. */
async function mediaServed(app, port, log) {
  const base = `http://localhost:${port}`
  const html = await (await fetch(`${base}/media`)).text()
  const sources = [...html.matchAll(/<source[^>]* src="([^"]+)"[^>]* type="([^"]+)"/g)].map(m => ({ url: m[1], type: m[2].replaceAll('&quot;', '"') }))
  if (!html.includes('<video') || !html.includes('<audio')) throw new Error('media: no <video> or <audio> in the page')
  const wanted = { 'video/mp4': /h264/, 'video/webm': /av1|vp9/, 'audio/webm': /opus/, 'audio/mp4': /aac/ }
  for (const need of ['loop', 'clip', 'tone']) if (!sources.some(s => s.url.includes(need))) throw new Error(`media: no source for ${need}`)
  for (const { url, type } of sources) {
    const whole = await fetch(base + url)
    if (whole.status !== 200) throw new Error(`media: ${url} answered ${whole.status}`)
    if (!/immutable/.test(whole.headers.get('cache-control') ?? '')) throw new Error(`media: ${url} isn't cached for good: ${whole.headers.get('cache-control')}`)
    const file = join(app, 'probe.bin')
    writeFileSync(file, Buffer.from(await whole.arrayBuffer()))
    const codecs = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file], { encoding: 'utf8' })
    if (!wanted[type.split(';')[0]].test(codecs)) throw new Error(`media: ${url} says ${type} and holds ${codecs}`)
    const part = await fetch(base + url, { headers: { range: 'bytes=0-99' } })
    if (part.status !== 206 || (await part.arrayBuffer()).byteLength !== 100) throw new Error(`media: ${url} ignores ranges: ${part.status}`)
  }
  log(`${sources.length} encoded files served: pass`)

  // An upload a build never saw: it answers straight away, and each rung comes off the media route by ranges.
  const body = new FormData()
  body.set('$fn', fnId('upload', 'src/server/upload.ts'))
  body.set('file', new File([readFileSync(join(app, 'src/routes/clip.mov'))], 'clip.mov', { type: 'video/quicktime' }))
  const posted = await fetch(`${base}/media`, { method: 'POST', redirect: 'manual', headers: { origin: base }, body })
  if (posted.status !== 303) throw new Error(`media: the upload answered ${posted.status}`)
  const record = (await (await fetch(`${base}/_weft/fn/${fnId('lastUpload', 'src/server/upload.ts')}`)).json()).v
  if (record?.kind !== 'video' || !record.poster) throw new Error(`media: the upload's record is ${JSON.stringify(record)}`)
  const part = await fetch(base + record.src, { headers: { range: 'bytes=0-99' } })
  if (part.status !== 206) throw new Error(`media: the uploaded video ignores ranges: ${part.status}`)
  log('video upload encoded and served: pass')
}

// Four apps: the default, Tailwind, a re-themed warp app that gets Tailwind later through `weft add`, and one that adds
// media and ffmpeg and encodes a GIF, a video ladder and an audio file (ffmpeg has to be installed for that one).
const theme = `{ seed: { hue: 220, chroma: 0.12 }, dials: { expression: 'quiet', density: 'compact' }, radius: 'round', fonts: { body: 'Georgia, serif' } }`
const only = process.argv[3]
const apps = [
  { name: 'default', options: { ui: 'warp', db: 'sqlite', auth: true } },
  { name: 'tailwind', options: { ui: 'tailwind', db: 'sqlite', auth: true }, css: ['.flex{', '.rounded-lg{'] },
  { name: 'themed', options: { ui: 'warp', db: 'none' }, theme, add: 'tailwind', css: ['--warp-radius-control:14px', '.mx-3{'] },
  { name: 'media', options: { ui: 'warp', db: 'none' }, media: true },
]

let port = 5198
for (const { name, options, theme, add, css, media } of apps.filter(a => !only || a.name === only)) {
  const app = join(root, name)
  const log = text => console.log(`[packed] ${name}: ${text}`)
  scaffold(app, options)
  writeFileSync(join(app, 'package.json'), JSON.stringify(pin(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), tarballs), null, 2))
  if (theme) {
    const file = join(app, 'weft.config.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('warp()', `warp(${theme})`))
  }

  sh('npm', ['install', '--silent'], app)
  const weft = join(app, 'node_modules/.bin/weft')
  if (add) {
    sh(weft, ['add', add], app)
    // Something only Tailwind can have built, in the app's own markup.
    const home = join(app, 'src/routes/index.tsx')
    writeFileSync(home, readFileSync(home, 'utf8').replace('<Badge', '<Badge class="mx-3"'))
    log(`weft add ${add}: pass`)
  }
  if (media) mediaApp(app, weft, log)
  for (const [cmd, ...args] of [...(options.db === 'none' ? [] : [['weft', 'db', 'generate']]), ['tsc', '--noEmit'], ['weft', 'check'], ['weft', 'build']]) {
    sh(join(app, 'node_modules/.bin', cmd), args, app)
    log(`${cmd} ${args.join(' ')}: pass`)
  }
  const built = readdirSync(join(app, '.output/public/assets')).filter(f => f.endsWith('.css')).map(f => readFileSync(join(app, '.output/public/assets', f), 'utf8')).join('')
  for (const text of css ?? []) if (!built.includes(text)) throw new Error(`${name}: the built CSS has no ${text}`)

  // Production takes the host's environment, so the scaffold's .env goes in by hand.
  const envFile = join(app, '.env')
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  port++
  const server = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: app, env: { ...process.env, ...env, PORT: String(port) }, stdio: 'ignore' })
  try {
    let status
    for (let i = 0; i < 80 && !status; i++) {
      status = await fetch(`http://localhost:${port}/`).then(r => r.status, () => undefined)
      if (!status) await new Promise(ok => setTimeout(ok, 250))
    }
    if (status !== 200) throw new Error(`${name}: the built server answered ${status}`)
    log('built server: pass')
    if (media) await mediaServed(app, port, log)
  } finally {
    server.kill()
  }
}
console.log('[packed] all pass')
