// Surfaces in a real browser (research 33 §10): pixels, not recordings. Builds demo/, serves it, and checks the Keel port
// and both built-in backends.   node test/e2e.mjs <chrome|webkit>     (build ../text first)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright-core'
import { build } from 'vite'
import weft from '@weft-js/core/vite'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = join(pkg, 'demo')
const browserName = process.argv[2] ?? 'chrome'
const out = mkdtempSync(join(tmpdir(), 'weft-surfaces-'))

execFileSync('node', [resolve(pkg, '../cli/bin/weft.mjs'), 'plugins', 'sync'], { cwd: demo, stdio: 'pipe' })
await build({ root: demo, configFile: false, logLevel: 'error', plugins: [weft()], build: { outDir: out, emptyOutDir: true, minify: false } })

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const file = join(out, path === '/' ? 'index.html' : path)
  if (!existsSync(file)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => { server.listen(0, '127.0.0.1', r) })
const base = `http://127.0.0.1:${server.address().port}`

const webkitPath = () => {
  const root = join(process.env.HOME, 'Library/Caches/ms-playwright')
  return process.env.WEBKIT_PATH ?? join(root, readdirSync(root).filter(d => d.startsWith('webkit-')).sort()[0], 'pw_run.sh')
}
const browser = browserName === 'webkit' ? await webkit.launch({ headless: true, executablePath: webkitPath() }) : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

let failed = 0
const ok = (name, pass, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
  if (!pass) failed++
}
const open = async (path, options = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2, ...options })
  const page = await ctx.newPage()
  await page.addInitScript(hashScript)
  page.problems = []
  page.on('pageerror', e => page.problems.push(e.message))
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message|status of 404/.test(m.text())) page.problems.push(m.text()) })
  await page.goto(`${base}/${path}`)
  await page.waitForFunction(() => window.lab)
  return page
}
const frames = (page, n = 3) => page.evaluate(count => new Promise(done => { const go = i => (i ? requestAnimationFrame(() => go(i - 1)) : done()); go(count) }), n)

/** Copied out of the canvas in the same task as `paint`, so a cleared drawing buffer can't fool it. */
const hashScript = `globalThis.hashOf = (canvas, w = canvas.width, h = canvas.height, top = 0) => {
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(canvas, 0, top, w, h, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  let hash = 2166136261, inked = 0
  for (let i = 0; i < d.length; i++) { hash = Math.imul(hash ^ d[i], 16777619); if (i % 4 === 3 && d[i]) inked++ }
  return { hash: hash >>> 0, inked }
}`

console.log(`${browserName} ${browser.version()}`)

console.log('Keel port')
{
  const page = await open('')
  await page.waitForFunction(() => document.querySelector('[data-surface="keel-demo"] canvas')?.width === 256)
  await frames(page)
  const shape = await page.evaluate(() => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect(); return { w: c.width, h: c.height, css: [r.width, r.height], pixelated: getComputedStyle(c).imageRendering, label: c.getAttribute('aria-label') } })
  ok('integer scale and nearest sampling', shape.w === 256 && shape.css[0] % 256 === 0 && shape.css[0] / 256 === shape.css[1] / 144 && /pixelated|crisp/.test(shape.pixelated), JSON.stringify(shape))
  ok('the canvas is named', shape.label === 'KEEL scene')
  const atFrame = seconds => page.evaluate(s => { clock.seek(s); return hashOf(document.querySelector('canvas')) }, seconds)
  const a = await atFrame(2), other = await atFrame(1), b = await atFrame(2)
  ok('the scene renders', a.inked > 0)
  ok('same frame, same pixels', a.hash === b.hash, `${a.hash}`)
  ok('another frame, other pixels', a.hash !== other.hash)
  const direct = await page.evaluate(async seconds => {
    const { colours, ramps, world, view, runtime } = keelScene
    const { renderer } = await runtime()
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144
    const { fields: { px } } = renderer.context(canvas, { name: 'direct', pixel: { width: 256, height: 144 } })
    px.setPalette(colours, ramps); px.setMaterials([{ ramp: 'surface' }, { ramp: 'accent' }]); px.setWorld(world); px.setStyle({ screen: 4 })
    px.render(view(seconds))
    return hashOf(canvas)
  }, 2).catch(e => ({ error: e.message }))
  ok('the same pixels as KEEL\'s renderer driven directly', direct.hash === a.hash, JSON.stringify({ direct, surface: a }))
  const before = await page.evaluate(() => hashOf(document.querySelector('canvas')))
  const label = () => page.getByRole('button').textContent()
  ok('it starts paused, like the original', (await label()) === 'PLAY')
  await page.getByRole('button').click()
  await page.waitForFunction(() => document.querySelector('button').textContent === 'PAUSE')
  await frames(page, 12)
  const after = await page.evaluate(() => { clock.seek(clock.seconds); return hashOf(document.querySelector('canvas')) })
  ok('PLAY animates', before.hash !== after.hash)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

console.log('canvas2d')
{
  const page = await open('?page=lab')
  await page.waitForFunction(() => document.querySelector('[data-surface-text]'))
  await page.waitForFunction(() => { const c = document.querySelector('[data-surface="bars"] canvas'); return hashOf(c, c.width, 100).inked > 40 }, undefined, { timeout: 5000 }).catch(e => { console.log(page.problems); throw e })
  const box = await page.evaluate(() => { const c = document.querySelector('[data-surface="bars"] canvas'), r = c.getBoundingClientRect(); return { w: c.width, h: c.height, css: [r.width, r.height] } })
  ok('backing store is CSS size × dpr', box.w === box.css[0] * 2 && box.h === box.css[1] * 2, JSON.stringify(box))

  const change = await page.evaluate(async () => {
    const records = []
    const seen = new MutationObserver(r => records.push(...r))
    seen.observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    const paints = lab.paints, bodies = lab.body
    lab.level.value = 60; lab.level.value = 90; lab.level.value = 120
    await new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(r)) })
    seen.disconnect()
    return { mutations: records.length, paints: lab.paints - paints, bodies: lab.body - bodies, tints: 0 }
  })
  ok('three writes in a frame: one paint, 0 DOM mutations, no re-render', change.paints === 1 && change.mutations === 0 && change.bodies === 0, JSON.stringify(change))

  const mirror = await page.evaluate(() => { const p = document.querySelector('[data-surface-text]'), c = getComputedStyle(p), r = p.getBoundingClientRect(); return { color: c.color, height: r.height, text: p.textContent, tag: p.tagName, inTree: !p.closest('[aria-hidden]') } })
  ok('the mirror is real, transparent text', mirror.tag === 'P' && /0\)$|transparent/.test(mirror.color) && mirror.inTree, JSON.stringify(mirror))
  const predicted = await page.evaluate(() => [lab.heading.lineCount.value, lab.heading.height.value])
  ok('and wraps as predicted', predicted[0] > 1 && mirror.height === predicted[1], `${predicted[0]} lines, ${predicted[1]} px predicted, ${mirror.height} px rendered`)
  await page.waitForFunction(() => lab.scripts.lineCount.value > 0, null, { timeout: 5000 }).catch(() => {})
  ok('Arabic and CJK lay out through the bundled lazy packs', await page.evaluate(() => lab.scripts.lineCount.value > 0 && lab.scripts.height.value === lab.scripts.el.getBoundingClientRect().height), await page.evaluate(() => `${lab.scripts.lineCount.value} lines, ${lab.scripts.height.value} px predicted, ${lab.scripts.el.getBoundingClientRect().height} px rendered`))
  const name = await page.getByRole('paragraph').first().textContent()
  ok('assistive tech can read it', name?.startsWith('A surface title'))

  const region = () => page.evaluate(() => { const c = document.querySelector('[data-surface="bars"] canvas'); return hashOf(c, c.width, 120) })
  const english = await region()
  await page.evaluate(() => { document.querySelector('[data-surface-text]').firstChild.nodeValue = 'Ein Titel' })
  await frames(page, 4)
  const german = await region()
  ok('a translator\'s edit of the mirror repaints the canvas', english.hash !== german.hash && german.inked < english.inked, `${english.inked} → ${german.inked} inked`)
  await page.evaluate(() => { lab.title.value = 'Back' })
  await frames(page, 4)
  ok('a box change repaints text in one DOM write', (await page.evaluate(() => document.querySelector('[data-surface-text]').textContent)) === 'Back')

  await page.setViewportSize({ width: 200, height: 900 })
  await frames(page, 4)
  const small = await page.evaluate(() => { const c = document.querySelector('[data-surface="bars"] canvas'), r = c.getBoundingClientRect(); return { w: c.width, css: r.width, height: lab.paints } })
  ok('a resize refits the canvas', small.w === small.css * 2, JSON.stringify(small))
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

for (const [name, media] of [['forced colours', { forcedColors: 'active' }], ['print', { media: 'print' }]]) {
  const page = await open('?page=lab')
  await page.waitForFunction(() => { const c = document.querySelector('[data-surface="bars"] canvas'); return hashOf(c, c.width, 100).inked > 40 })
  if (name === 'forced colours' && browserName === 'webkit') { await page.context().close(); continue }
  await page.emulateMedia(media)
  await frames(page, 3)
  const r = await page.evaluate(() => { const c = document.querySelector('[data-surface="bars"] canvas'), p = document.querySelector('[data-surface-text]'); return { text: hashOf(c, c.width, 350).inked, bar: hashOf(c, c.width, 60, c.height - 60).inked, color: getComputedStyle(p).color } })
  console.log(name)
  ok('the canvas drops its text, keeps its drawing, and the mirror shows', r.text === 0 && r.bar > 0 && !/rgba\(.*, 0\)$|transparent/.test(r.color), JSON.stringify(r))
  await page.context().close()
}

console.log('webgl2')
{
  const page = await open('?page=lab')
  await page.waitForFunction(() => lab.frames > 2)
  const read = () => page.evaluate(() => { const g = lab.gl, p = new Uint8Array(4); g.readPixels(1, 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, p); return [...p] })
  await page.evaluate(() => { lab.level.value = 100; clock.pause() })
  await frames(page, 3)
  const px = await read()
  ok('s.tokens.accent.linear reaches the shader', Math.abs(px[0] - 147) < 12 && px[1] < 30, `${px.join()} (accent rgb(200,40,40) in linear)`)
  const held = await page.evaluate(async () => { const n = lab.frames; await new Promise(r => { setTimeout(r, 200) }); return lab.frames - n })
  ok('pause stops the loop', held === 0, `${held} frames`)
  await page.evaluate(() => { lab.level.value = 0 })
  await frames(page, 3)
  ok('a box change repaints while paused', (await read())[2] < px[2] || px[2] === 0, (await read()).join())
  await page.evaluate(() => clock.play())
  ok('the mirror is the visible text', (await page.evaluate(() => getComputedStyle(document.getElementById('gl-label')).color)) === 'rgb(255, 255, 255)')
  const lost = await page.evaluate(async () => {
    const ext = lab.gl.getExtension('WEBGL_lose_context')
    const before = lab.setups
    ext.loseContext()
    await new Promise(r => { setTimeout(r, 100) })
    ext.restoreContext()
    await new Promise(r => { setTimeout(r, 200) })
    return lab.setups - before
  })
  ok('a lost context comes back and setup runs again', lost === 1, `${lost}`)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

{
  const page = await open('?page=lab', { reducedMotion: 'reduce' })
  await page.waitForFunction(() => lab.setups > 0)
  await frames(page, 6)
  const r = await page.evaluate(() => ({ playing: clock.playing.value, frame: lab.frame, seconds: clock.seconds }))
  console.log('reduced motion')
  ok('the clock starts paused on the first frame', r.playing === false && r.frame === 0 && r.seconds === 0, JSON.stringify(r))
  await page.context().close()
}

await browser.close()
server.close()
rmSync(out, { recursive: true, force: true })
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
