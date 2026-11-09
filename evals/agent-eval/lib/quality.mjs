import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { axe, chromium, run } from './browser.mjs'
import { here } from './paths.mjs'

function trackBytes(page) {
  const bytes = { html: { raw: 0, gz: 0 }, js: { raw: 0, gz: 0 }, css: { raw: 0, gz: 0 } }
  const waits = []
  page.on('response', (r) =>
    waits.push(
      (async () => {
        const type = r.headers()['content-type'] ?? '',
          kind = /javascript/.test(type)
            ? 'js'
            : /css/.test(type)
              ? 'css'
              : /html/.test(type)
                ? 'html'
                : null // the document counts: inlined JS and CSS are still bytes
        if (!kind) return
        const body = await r.body().catch(() => null)
        if (body) {
          bytes[kind].raw += body.length
          bytes[kind].gz += gzipSync(body, { level: 9 }).length
        }
      })(),
    ),
  )
  return { bytes, settled: () => Promise.all(waits) }
}

async function axeViolations(page) {
  await page.addScriptTag({ content: axe })
  return page.evaluate(async () =>
    (await window.axe.run()).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  )
}

/** Quality of the final app: bytes on the wire for `/`, axe, an interaction timing from the task, lines changed. */
export async function quality(task, base, copy, golden) {
  const { interaction } = await import(pathToFileURL(join(here, 'tasks', task, 'hidden.mjs')).href)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const { bytes, settled } = trackBytes(page)
  await page.goto(base, { waitUntil: 'networkidle' })
  await settled()
  const a11y = await axeViolations(page)
  let timing
  try {
    timing = interaction ? await interaction(page, base) : null
  } catch (e) {
    timing = { error: e.message.slice(0, 200) }
  }
  await browser.close()
  return {
    bytes,
    a11y,
    timing,
    lines: changedLines(golden, copy.app),
    lighthouse: await lighthouse(base),
  }
}

async function lighthouse(url) {
  const script = join(here, '../../examples/lib/lighthouse-run.mjs')
  if (!existsSync(join(here, '../../examples/node_modules/lighthouse')))
    return { skipped: 'install examples with pnpm first' }
  try {
    const { stdout } = await run(
      process.execPath,
      [script, JSON.stringify({ url, formFactor: 'mobile', chrome: chromium.executablePath() })],
      { maxBuffer: 1 << 26, timeout: 120_000 },
    )
    const { score, fcp, lcp, tbt, cls } = JSON.parse(stdout)
    return { score, fcp, lcp, tbt, cls }
  } catch (e) {
    return { error: e.message.slice(0, 200) }
  }
}

const SKIP = new Set([
  'node_modules',
  '.next',
  'dist',
  '.output',
  '.weft',
  '.git',
  'package-lock.json',
  'next-env.d.ts',
])
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|wasm)$/
function sources(root, dir = root, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.isSymbolicLink()) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(root, p, out)
    else if (!BINARY.test(e.name)) out.set(relative(root, p), readFileSync(p, 'utf8').split('\n'))
  }
  return out
}
/** Lines added and removed against the scaffold, as multisets per file, generated files out. */
function changedLines(a, b) {
  const was = sources(a),
    now = sources(b)
  let added = 0,
    removed = 0,
    files = 0
  for (const name of new Set([...was.keys(), ...now.keys()])) {
    const left = new Map()
    for (const l of was.get(name) ?? []) left.set(l, (left.get(l) ?? 0) + 1)
    let plus = 0
    for (const l of now.get(name) ?? []) {
      const n = left.get(l) ?? 0
      if (n) left.set(l, n - 1)
      else plus++
    }
    const minus = [...left.values()].reduce((x, y) => x + y, 0)
    if (plus || minus) {
      added += plus
      removed += minus
      files++
    }
  }
  return { added, removed, files }
}
