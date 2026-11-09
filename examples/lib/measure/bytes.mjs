import { createHash } from 'node:crypto'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const pathOf = (u) => {
  try {
    const p = new URL(u)
    return p.pathname + p.search
  } catch {
    return u
  }
}

const br = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const sizeCache = new Map()
function sizesOf(buf) {
  const h = createHash('sha1').update(buf).digest('hex')
  if (!sizeCache.has(h))
    sizeCache.set(h, { raw: buf.length, br: br(buf), gz: gzipSync(buf, { level: 9 }).length })
  return sizeCache.get(h)
}
const kind = (type, url) =>
  /javascript|ecmascript/.test(type) || /\.m?js(\?|$)/.test(url)
    ? 'js'
    : /css/.test(type) || /\.css(\?|$)/.test(url)
      ? 'css'
      : /html/.test(type)
        ? 'html'
        : /font/.test(type) || /\.(woff2?|ttf|otf)(\?|$)/.test(url)
          ? 'font'
          : /image/.test(type)
            ? 'img'
            : 'other'

/** Bytes a V8 block-coverage entry didn't run. Ranges nest, outermost first, so later ones overwrite. */
function unusedJs(entry) {
  const len = entry.source?.length ?? 0,
    seen = new Uint8Array(len).fill(1)
  for (const fn of entry.functions)
    for (const r of fn.ranges) seen.fill(r.count ? 1 : 0, r.startOffset, r.endOffset)
  return { size: len, unused: seen.reduce((n, x) => n + (x ? 0 : 1), 0) }
}

function collectResponses(page, seen, origin, wait) {
  page.on('response', (r) =>
    wait.push(
      (async () => {
        if (r.status() >= 300 || r.url().startsWith('data:')) return
        const body = await r.body().catch(() => null),
          sizes = await r
            .request()
            .sizes()
            .catch(() => null)
        if (!body) return
        seen.push({
          url: r.url(),
          local: r.url().startsWith(origin),
          type: kind(r.headers()['content-type'] ?? '', r.url()),
          wire: sizes?.responseBodySize ?? null,
          encoding: r.headers()['content-encoding'] ?? 'none',
          ...sizesOf(body),
        })
      })(),
    ),
  )
}

function unusedByUrl(js, css) {
  const unused = new Map()
  for (const e of js) {
    const u = unusedJs(e),
      a = unused.get(e.url) ?? { size: 0, unused: 0 }
    a.size += u.size
    a.unused += u.unused
    unused.set(e.url, a)
  }
  for (const e of css) {
    const used = e.ranges.reduce((n, r) => n + r.end - r.start, 0),
      size = e.text?.length ?? 0
    unused.set(e.url, { size, unused: Math.max(0, size - used) })
  }
  return unused
}

function totalsOf(seen) {
  const totals = Object.fromEntries(
    ['js', 'css', 'html', 'font', 'img', 'other'].map((k) => [k, { raw: 0, br: 0, gz: 0 }]),
  )
  for (const r of seen) for (const k of ['raw', 'br', 'gz']) totals[r.type][k] += r[k]
  return totals
}

const wasteOf = (seen, unused, t) =>
  seen
    .filter((r) => r.type === t)
    .reduce((n, r) => {
      const u = unused.get(r.url)
      return n + (u?.size ? (r.br * u.unused) / u.size : 0)
    }, 0)

const topOf = (seen, unused) =>
  seen
    .map((r) => ({
      path: pathOf(r.url),
      type: r.type,
      br: r.br,
      gz: r.gz,
      raw: r.raw,
      wire: r.wire,
      encoding: r.encoding,
      unusedPct: unused.get(r.url)?.size
        ? Math.round((100 * unused.get(r.url).unused) / unused.get(r.url).size)
        : null,
    }))
    .sort((a, b) => b.br - a.br)

function summarizeBytes(seen, unused) {
  return {
    totals: totalsOf(seen),
    unusedBr: { js: wasteOf(seen, unused, 'js'), css: wasteOf(seen, unused, 'css') },
    top: topOf(seen, unused),
    assets: seen
      .filter(
        (r) => r.local && (r.type === 'js' || r.type === 'css') && !/\/[^.]*$/.test(pathOf(r.url)),
      )
      .map((r) => pathOf(r.url)),
    thirdParty: seen.filter((r) => !r.local).reduce((n, r) => n + r.br, 0),
  }
}

/** Fresh context, no throttle: what crossed the wire, sized the same way for everyone, and what of it ran. */
export async function bytesPass(browser, url, { cookies = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 } }),
    page = await ctx.newPage()
  await ctx.addCookies(cookies)
  const seen = [],
    origin = new URL(url).origin,
    wait = []
  collectResponses(page, seen, origin, wait)
  await page.coverage.startJSCoverage({ resetOnNavigation: false })
  await page.coverage.startCSSCoverage({ resetOnNavigation: false })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(300)
  const js = await page.coverage.stopJSCoverage(),
    css = await page.coverage.stopCSSCoverage()
  await Promise.all(wait)
  const unused = unusedByUrl(js, css)
  await ctx.close()
  return summarizeBytes(seen, unused)
}
