// The Phase 3c gate for `encoder: 'compatible'` (research 15 §5.3): a real right-click and "Save as" in headed Chromium
// and Firefox against a built app. Playwright's mouse can't reach the browser's own menu, so X11 input does (xdotool);
// it needs Linux, Xvfb and a built app, the one `packed.mjs <dir> media` leaves:
//
//   xvfb-run -a -s "-screen 0 1280x1000x24" node packages/plugin-media/test/save.headful.mjs <dir>/media
//
// Also here because they need a real browser: a copy already in the HTTP cache swaps in at mount, and timeline() boxes.
import { sleep } from '../../../scripts/lib/helpers.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const app = resolve(process.argv[2])
const { chromium, firefox } = createRequire(join(process.cwd(), 'package.json'))('playwright-core')
const PORT = 5301
const PROXY = 5302
const x = (...args) => execFileSync('xdotool', args.map(String))
const dl = join(app, 'saved')
const failures = []
const check = (ok, line) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${line}`)
  if (!ok) failures.push(line)
}
const kind = (file) => {
  const b = Buffer.alloc(16)
  readSync(openSync(file, 'r'), b, 0, 16, 0)
  const h = b.toString('latin1')
  return h.startsWith('GIF')
    ? 'gif'
    : h.slice(1, 4) === 'PNG'
      ? 'png'
      : h.slice(8, 12) === 'avif'
        ? 'avif'
        : h.slice(4, 8) === 'ftyp'
          ? 'mp4'
          : b[0] === 0xff
            ? 'jpeg'
            : b[0] === 0x1a
              ? 'webm'
              : 'other'
}

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: app,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
})
// A second origin keeps these saves out of the cached-first case below.
const proxy = createServer((req, res) => {
  const up = request(
    { port: PORT, path: req.url, method: req.method, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode, r.headers)
      r.pipe(res)
    },
  )
  req.pipe(up)
}).listen(PROXY)
for (let i = 0; i < 80; i++) {
  if (
    await fetch(`http://localhost:${PORT}/media`).then(
      (r) => r.ok,
      () => false,
    )
  )
    break
  await sleep(250)
}

const BROWSERS = [
  [
    'chromium',
    chromium,
    { args: ['--window-position=0,0', '--window-size=900,950', '--no-sandbox'] },
  ],
  [
    'firefox',
    firefox,
    {
      firefoxUserPrefs: {
        'media.autoplay.default': 0,
        'browser.download.dir': dl,
        'browser.download.folderList': 2,
      },
    },
  ],
]
const CASES = [
  ['still', 'jpeg', /\.jpg/],
  ['graphic', 'png', /\.png/],
  ['gif', 'gif', /\.gif/],
  ['video', 'mp4', /\.mp4/],
]

try {
  for (const [name, type, options] of BROWSERS) {
    for (const [target, wanted, url] of CASES) {
      rmSync(dl, { recursive: true, force: true })
      mkdirSync(dl, { recursive: true })
      const browser = await type.launch({ headless: false, downloadsPath: dl, ...options })
      const page = await (
        await browser.newContext({ viewport: null, acceptDownloads: true })
      ).newPage()
      const downloads = []
      page.on('download', (d) => downloads.push(d))
      await page.goto(`http://localhost:${PROXY}/media`)
      await sleep(1500)
      const at = await page.evaluate((t) => {
        const el = document.querySelector(`[data-save="${t}"]`)
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        const left = window.mozInnerScreenX ?? window.screenX
        const top =
          window.mozInnerScreenY ?? window.screenY + window.outerHeight - window.innerHeight
        return { x: left + r.x + r.width / 2, y: top + r.y + r.height / 3, left, top }
      }, target)
      await sleep(200)
      x('mousemove', Math.round(at.x), Math.round(at.y))
      await sleep(900) // past the dwell, and the copy is in
      // Firefox writes no file for "Save Video As" under Playwright, swap or not, so that case reads what its menu saves.
      const under = await page.evaluate(
        ({ px, py }) => document.elementFromPoint(px, py)?.currentSrc,
        { px: at.x - at.left, py: at.y - at.top },
      )
      x('click', 3)
      await sleep(800)
      x('key', 'v')
      await sleep(1500)
      if (name === 'firefox') {
        x('key', 'Return')
        await sleep(1500)
      }
      let saved
      if (downloads[0]) {
        const file = join(dl, 'x')
        await Promise.race([downloads[0].saveAs(file), sleep(4000)])
        saved = { url: downloads[0].url(), kind: existsSync(file) ? kind(file) : '?' }
      } else {
        const file = readdirSync(dl).find((f) => statSync(join(dl, f)).isFile())
        saved = { url: file ?? under ?? '', kind: file ? kind(join(dl, file)) : '?' }
      }
      check(
        url.test(saved.url) && (saved.kind === wanted || saved.kind === '?'),
        `${name} ${target}: saved ${saved.url} (${saved.kind}), wanted ${wanted}`,
      )
      await Promise.race([browser.close().catch(() => {}), sleep(3000)])
      execFileSync('sh', ['-c', "pkill -9 -f '[m]s-playwright/firefox' || true"])
    }
  }

  // Cached first: the second visit swaps at mount, with the pointer nowhere near and nothing fetched over the network.
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] })
  const page = await (await browser.newContext()).newPage()
  await page.goto(`http://localhost:${PORT}/media`)
  await sleep(1000)
  const efficient = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-save="still"]').parentElement.querySelectorAll('source')
          .length,
    )
  check((await efficient()) > 0, 'first visit: the efficient file, `<source>` still there')
  await page.hover('[data-save="still"]')
  await sleep(700)
  check(
    (await page.evaluate(() => document.querySelector('[data-save="still"]').currentSrc)).endsWith(
      '.jpg',
    ),
    'hover: the copy swapped in and loaded',
  )
  await page.mouse.move(800, 900)
  await page.goto(`http://localhost:${PORT}/media`)
  await sleep(1000)
  check((await efficient()) === 0, 'second visit: the cached copy is in at mount, no hover')

  // timeline() on the real element: the cue box updates from presented frames.
  await page.getByRole('button', { name: 'Play' }).click()
  await page
    .waitForFunction(() => document.querySelector('output').textContent === 'half', null, {
      timeout: 8000,
    })
    .then(
      () => check(true, 'timeline: seek, play, cue reached'),
      () => check(false, 'timeline: the cue never arrived'),
    )
  await browser.close()
} finally {
  server.kill()
  proxy.close()
}
console.log(failures.length ? `${failures.length} failed` : 'all pass')
process.exit(failures.length ? 1 : 0)
