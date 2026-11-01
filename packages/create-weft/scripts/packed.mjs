// The packed-install gate: every package as a tarball in a fresh full-stack scaffold, so what's checked is what a
// consumer installs. The other suites link the workspace, where undeclared dependencies and TypeScript loaded by Node
// both work; under node_modules neither does.
//
//   node packages/create-weft/scripts/packed.mjs <empty-dir> [app]
import { execFile, execFileSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { scaffold } from '../src/index.mjs'
import { fnId } from '../../start/src/vite.mjs'
import { packAll, pin, pkgs } from './tarballs.mjs'
import { jobs, pool } from '../../../scripts/jobs.mjs'

if (!process.argv[2]) throw new Error('usage: packed.mjs <empty-dir> [app]')
const root = resolve(process.argv.slice(2).find(a => !a.startsWith('--')))
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const sh = (cmd, args, cwd) => promisify(execFile)(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })

const tarballs = packAll(join(root, 'tgz'))

/** The add path a user takes, three sources, and a page that renders them. */
async function mediaApp(app, weft, log) {
  await sh(weft, ['add', 'media'], app)
  await sh(weft, ['add', 'media-ffmpeg'], app)
  await sh('npm', ['install', '--silent', 'sharp@0.35.5'], app) // the media route loads it at run time (M017)
  const config = join(app, 'weft.config.ts')
  writeFileSync(config, readFileSync(config, 'utf8').replace(/media\(\)/, "media({ encoder: 'compatible', quality: { scorer: 'none' }, video: { widths: [160, 320] } })"))
  await sh(weft, ['plugins', 'approve', '--all'], app)
  log('weft add media, media-ffmpeg, approve: pass')
  const ff = (...args) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], app)
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=2:r=15', '-vf', 'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none', 'src/routes/loop.gif')
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=3:r=24', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', 'src/routes/clip.mov')
  await ff('-f', 'lavfi', '-i', 'sine=f=330:d=1', 'src/routes/tone.wav')
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=1', '-frames:v', '1', '-q:v', '2', 'src/routes/hero.jpg')
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1', '-frames:v', '1', 'src/routes/card.png')
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
    <main style="display:grid;gap:var(--warp-space-related);justify-items:start">
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

/** Preloaded into the built server of the pay app: a request that leaves this machine fails the gate instead of being sent. */
const LOOPBACK_ONLY = `const real = globalThis.fetch
globalThis.fetch = (input, init) => {
  const { hostname } = new URL(input?.url ?? input)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) throw new Error('no-network: refused a request to ' + hostname)
  return real(input, init)
}
`

/** The add path, a page that sells, and a report only a buyer may read. The rail talks to `mock`, a local stand-in for Stripe. */
async function payApp(app, weft, mock, log) {
  await sh(weft, ['add', 'pay'], app)
  const config = join(app, 'weft.config.ts')
  const text = readFileSync(config, 'utf8')
  const pointed = text.replace(/\b(\w*[sS]tripe)\(\)/, `$1({ api: 'http://127.0.0.1:${mock}' })`)
  if (pointed === text) throw new Error(`pay: no Stripe plugin call to point at the mock in:\n${text}`) // never fall through to the real API
  writeFileSync(config, pointed)
  await sh(weft, ['plugins', 'approve', '--all'], app)
  if (!readFileSync(join(app, '.weft/slots/pay.rail.ts'), 'utf8').includes(`127.0.0.1:${mock}`)) await sh(weft, ['plugins', 'sync'], app)
  if (!readFileSync(join(app, '.weft/slots/pay.rail.ts'), 'utf8').includes(`127.0.0.1:${mock}`)) throw new Error('pay: the rail is not pointed at the mock')
  writeFileSync(join(app, 'no-network.mjs'), LOOPBACK_ONLY)
  writeFileSync(join(app, 'src/server/report.ts'), `import { query } from '@weft/start'\n\nexport const report = query({ auth: 'user', requires: ['pro'], run: () => 'the numbers' })\n`)
  writeFileSync(join(app, 'src/routes/pricing.tsx'), `import { price } from '@weft/pay'
import { pro } from '#/pay/catalog'
import { checkout, entitlements } from '#/server/pay'

export default function Pricing() {
  const mine = entitlements.live()
  return (
    <main>
      <p>{mine.value?.includes('pro') ? 'Thanks' : 'Free'}</p>
      <button onClick={() => checkout({ product: 'pro', plan: 'month' })}>Go Pro: {price(pro, 'month').display}</button>
    </main>
  )
}
`)
  log('weft add pay, approve: pass')
}

/** A whole purchase against the built server: sign up, check out at the mock, then signed webhooks, forged and repeated ones. */
async function payServed(port, sessions, secret, log) {
  const base = `http://localhost:${port}`
  const email = 'buyer@example.test'
  const signup = await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ name: 'Buyer', email, password: 'correct-horse-battery' }) })
  if (!signup.ok) throw new Error(`pay: sign-up answered ${signup.status}: ${await signup.text()}`)
  const cookie = signup.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const user = (await signup.json()).user.id
  const call = (name, file) => fetch(`${base}/_weft/fn/${fnId(name, file)}`, { headers: { cookie, accept: 'application/json' } })
  const report = () => call('report', 'src/server/report.ts').then(r => r.status)
  const first = await call('report', 'src/server/report.ts')
  if (first.status !== 403) throw new Error(`pay: a non-buyer got ${first.status}: ${await first.text()}`)

  const mutate = await fetch(`${base}/_weft/fn/${fnId('checkout', 'src/server/pay.ts')}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', accept: 'application/json', 'x-weft': '1', origin: base }, body: JSON.stringify({ i: { product: 'pro', plan: 'month' }, f: [] }) })
  const answer = await mutate.json()
  if (!answer.r?.startsWith('http://127.0.0.1')) throw new Error(`pay: checkout answered ${JSON.stringify(answer)}`)
  if (sessions.length !== 1 || !sessions[0].authorized) throw new Error(`pay: the mock saw ${JSON.stringify(sessions)}`)
  if (await report() !== 403) throw new Error('pay: checkout granted something')
  log('checkout reaches the mock rail and grants nothing: pass')

  const hook = (event, key = secret) => {
    const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000)
    const v1 = createHmac('sha256', key).update(`${t}.${body}`).digest('hex')
    return fetch(`${base}/_weft/x/pay/stripe`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' }, body }).then(r => r.status)
  }
  const event = (id, status, ahead = 0) => ({ id, type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000) + ahead, data: { object: { id: 'sub_1', status, customer: 'cus_1', current_period_end: Math.floor(Date.now() / 1000) + 2_592_000, metadata: { weft_user: user, weft_product: 'pro', weft_plan: 'month' } } } })
  if (await hook(event('evt_forged', 'active'), 'whsec_wrong') !== 400 || await report() !== 403) throw new Error('pay: a forged webhook was believed')
  if (await hook(event('evt_1', 'active')) !== 200 || await report() !== 200) throw new Error('pay: a signed webhook granted nothing')
  if (await hook(event('evt_2', 'canceled', 5)) !== 200 || await report() !== 403) throw new Error('pay: a cancellation was ignored')
  if (await hook(event('evt_1', 'active')) !== 200 || await report() !== 403) throw new Error('pay: a redelivery changed the ledger')
  log('webhooks: forged refused, signed granted, cancelled, redelivered: pass')
}

/** A local stand-in for Stripe: what the rail sends to `/v1/checkout/sessions`, answered with a URL. Nothing leaves the machine. */
function mockStripe(port, sessions) {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      sessions.push({ path: req.url, authorized: req.headers.authorization === 'Bearer sk_test_placeholder', body })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ id: 'cs_1', url: `http://127.0.0.1:${port}/hosted` }))
    })
  })
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)))
}

// Five apps: the default, Tailwind, a re-themed warp app that gets Tailwind later through `weft add`, one that adds media
// and ffmpeg and encodes a GIF, a video ladder and an audio file (ffmpeg has to be installed for that one), and one that
// adds payments and buys something from a mock of Stripe.
const theme = `{ seed: { hue: 220, chroma: 0.12 }, dials: { expression: 'quiet', density: 'compact' }, radius: 'round', fonts: { body: 'Georgia, serif' } }`
const only = process.argv.slice(2).filter(a => !a.startsWith('--'))[1]
const apps = [
  { name: 'default', options: { ui: 'warp', db: 'sqlite', auth: true } },
  { name: 'tailwind', options: { ui: 'tailwind', db: 'sqlite', auth: true }, css: ['.flex{', '.rounded-lg{'] },
  { name: 'themed', options: { ui: 'warp', db: 'none' }, theme, add: 'tailwind', css: ['--warp-radius-control:14px', '.mx-related{'] },
  { name: 'media', options: { ui: 'warp', db: 'none' }, media: true },
  { name: 'pay', options: { ui: 'warp', db: 'sqlite', auth: true }, pay: true },
]

await pool(apps.filter(a => !only || a.name === only), jobs(), async ({ name, options, theme, add, css, media, pay }, i) => {
  const app = join(root, name)
  const log = text => console.log(`[packed] ${name}: ${text}`)
  scaffold(app, options)
  writeFileSync(join(app, 'package.json'), JSON.stringify(pin(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), tarballs), null, 2))
  if (theme) {
    const file = join(app, 'weft.config.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('warp()', `warp(${theme})`))
  }

  await sh('npm', ['install', '--silent'], app)
  const weft = join(app, 'node_modules/.bin/weft')
  if (add) {
    await sh(weft, ['add', add], app)
    // Something only Tailwind can have built, in the app's own markup.
    const home = join(app, 'src/routes/index.tsx')
    writeFileSync(home, readFileSync(home, 'utf8').replace('<Badge', '<Badge class="mx-related"'))
    log(`weft add ${add}: pass`)
  }
  if (media) await mediaApp(app, weft, log)
  const sessions = []
  const mock = pay && await mockStripe(5299 + i, sessions)
  if (pay) await payApp(app, weft, 5299 + i, log)
  for (const [cmd, ...args] of [...(options.db === 'none' ? [] : [['weft', 'db', 'generate']]), ['tsc', '--noEmit'], ['weft', 'check'], ['weft', 'build']]) {
    await sh(join(app, 'node_modules/.bin', cmd), args, app)
    log(`${cmd} ${args.join(' ')}: pass`)
  }
  const built = readdirSync(join(app, '.output/public/assets')).filter(f => f.endsWith('.css')).map(f => readFileSync(join(app, '.output/public/assets', f), 'utf8')).join('')
  for (const text of css ?? []) if (!built.includes(text)) throw new Error(`${name}: the built CSS has no ${text}`)
  const client = readdirSync(join(app, '.output/public/assets')).filter(f => f.endsWith('.js')).map(f => readFileSync(join(app, '.output/public/assets', f), 'utf8')).join('')
  if (/STRIPE_|api\.stripe\.com|checkout\/sessions/.test(client)) throw new Error(`${name}: a rail reached the client`)
  if (!pay && /PayError|ENTITLEMENT_REQUIRED/.test(client)) throw new Error(`${name}: @weft/pay is in the bundle of an app that sells nothing`)

  // Production takes the host's environment, so the scaffold's .env goes in by hand.
  const envFile = join(app, '.env')
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  const port = 5199 + i
  const server = spawn(process.execPath, [...(pay ? ['--import', './no-network.mjs'] : []), '.output/server/index.mjs'], { cwd: app, env: { ...process.env, ...env, PORT: String(port), BETTER_AUTH_URL: `http://localhost:${port}` }, stdio: 'ignore' })
  try {
    let status
    for (let i = 0; i < 80 && !status; i++) {
      status = await fetch(`http://localhost:${port}/`).then(r => r.status, () => undefined)
      if (!status) await new Promise(ok => setTimeout(ok, 250))
    }
    if (status !== 200) throw new Error(`${name}: the built server answered ${status}`)
    log('built server: pass')
    if (media) await mediaServed(app, port, log)
    if (pay) await payServed(port, sessions, env.STRIPE_WEBHOOK_SECRET, log)
  } finally {
    server.kill()
    mock?.close()
  }
})

// A room on the packs' tarballs: two browsers, over the socket and then peer to peer. TypeScript in node_modules and the
// packs' optional dependencies are what this adds.
const room = join(root, 'room')
const browsers = join(pkgs, 'multiplayer/scripts/e2e-browsers.mjs')
writeFileSync(join(root, 'tgz/tarballs.json'), JSON.stringify(tarballs))
await sh('node', [browsers, 'prepare', room, '--tarballs', join(root, 'tgz')], root)
await sh('node', [browsers, 'run', room, '--runtimes', 'node'], root)
await sh('node', [browsers, 'run', room, '--runtimes', 'node', '--via', 'webrtc'], root)
console.log('[packed] room: two browsers: pass')
console.log('[packed] all pass')
