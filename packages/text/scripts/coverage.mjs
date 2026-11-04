// Coverage-guided split (lever c/g): run each engine's specialised core over in-alphabet text in headless
// Chrome with function coverage, and record which top-level functions ran. specialize.mjs then moves the
// prepare-time functions that never ran into the lazy "rare" pack. Their stubs throw PackMissing, which the
// provider catches in prepare(): it loads the pack and prepares again. So a miss here costs a lazy load,
// never accuracy. Layout-time modules (line-break.ts, layout.ts, line-text.ts, graphemes.ts) are never
// split this way, because layout() must not throw.
//   npm run coverage   (specialises without the rare split, runs this, writes src/coverage/<engine>.json,
//                       specialises again)
// The WebKit and Gecko cores run in Chrome too: their paths are fixed at build time, and the text drives
// the rest. Canvas answers differ per browser, which the safety net covers.
import * as esbuild from 'esbuild'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['blink', 'webkit', 'gecko']
fs.mkdirSync(path.join(root, 'src/coverage'), { recursive: true })

const driver = `
import { makeCorpus } from ${JSON.stringify(path.join(root, 'test/accuracy/corpus.js'))}
import * as P from './layout.ts'
import './pack-complex.ts'
import './pack-spacing.ts'
import './pack-families.ts'
import './pack-scripts.ts'
window.drive = () => {
  const fonts = ['16px Arial', '15px "Times New Roman"', '14px Georgia', '16px Helvetica', '13px Verdana', '16px "Courier New"', 'italic 600 17px Arial', '16px Arial, sans-serif']
  const corpora = ['latin', 'latin-hard', 'emoji']
  let n = 0
  for (const font of fonts) for (const c of corpora) {
    const texts = makeCorpus(c, 300, 7 + n++)
    // chat-like: pre-wrap with newlines and runs of spaces, every fifth paragraph
    const chat = texts.filter((_, i) => i % 5 === 0).map(t => t.replace(/ (\\S+) /g, (m, w, i) => i % 7 === 0 ? '\\n' + w + '  ' : m))
    for (const ws of ['normal', 'pre-wrap']) for (const t of ws === 'normal' ? texts : chat) {
      const p = P.prepareWithSegments(t, font, { whiteSpace: ws })
      for (const w of [40, 90, 200, 320, 480, 900]) {
        P.layout(p, w, 20)
        P.walkLineRanges(p, w, l => { P.materializeLineRange(p, l) })
      }
      P.prepare(t, font, { whiteSpace: ws })
    }
  }
  return n
}
`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const engine of engines) {
  const dir = path.join(root, 'gen', engine)
  const plain = await esbuild.build({
    stdin: { contents: driver, resolveDir: dir, loader: 'ts' },
    bundle: true,
    format: 'iife',
    write: false,
    minify: false,
    keepNames: false,
    target: 'es2020',
    logLevel: 'error',
    plugins: [
      {
        name: 'js-to-ts',
        setup(b) {
          b.onResolve({ filter: /^\.\.?\/.*\.js$/ }, (a) => {
            const t = path.join(a.resolveDir, a.path.replace(/\.js$/, '.ts'))
            return fs.existsSync(t) ? { path: t } : undefined
          })
        },
      },
    ],
  })
  const code = plain.outputFiles[0].text
  const ctx = await browser.newContext({
    userAgent:
      engine === 'webkit'
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'
        : engine === 'gecko'
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0'
          : undefined,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.coverage.startJSCoverage({ reportAnonymousScripts: true, resetOnNavigation: false })
  await page.setContent(
    `<!doctype html><html lang="en"><meta charset="utf-8"><body><script>${code}</script></body></html>`,
  )
  let missed = 0
  try {
    await page.evaluate(() => window.drive())
  } catch (e) {
    missed++
    console.error(engine, 'driver threw (a pack call?):', e.message.slice(0, 200))
  }
  const cov = await page.coverage.stopJSCoverage()
  /** @type {Set<string>} */
  const ran = new Set()
  for (const entry of cov)
    for (const fn of entry.functions)
      if (fn.ranges[0]?.count > 0 && fn.functionName) ran.add(fn.functionName.replace(/\d+$/, ''))
  const out = {
    engine,
    note: 'top-level function names that ran over the coverage corpus (scripts/coverage.mjs)',
    ran: [...ran].sort(),
  }
  fs.writeFileSync(
    path.join(root, 'src/coverage', `${engine}.json`),
    JSON.stringify(out, null, 1) + '\n',
  )
  console.log(`${engine}: ${ran.size} function names ran${missed ? ' (driver stopped early)' : ''}`)
  await ctx.close()
}
await browser.close()
