// Whether this machine's WebKit can open a page. Playwright's WebKit for an older macOS is a frozen build that the
// current playwright-core can't drive (macOS 14: "Unknown setting: PushAPIEnabled"), and a WebKit test there only
// waits out its timeout. The release gate asks first, and leaves WebKit out with the reason when the answer is no.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Resolves to `{ ok: true }`, or `{ ok: false, reason }` within `ms`. */
export async function webkitWorks(root, ms = 30_000) {
  let browser
  const attempt = (async () => {
    const from = createRequire(join(root, 'packages/start/package.json'))
    const pw = await import(pathToFileURL(from.resolve('playwright-core')).href)
    const webkit = pw.webkit ?? pw.default?.webkit
    browser = await webkit.launch()
    const page = await browser.newPage()
    await page.setContent('<p>ok</p>')
    if ((await page.textContent('p')) !== 'ok') throw new Error('the page rendered nothing')
    return { ok: true }
  })()
  let timer
  const limit = new Promise((ok) => {
    timer = setTimeout(() => ok({ ok: false, reason: `no page within ${ms / 1000}s` }), ms)
  })
  try {
    return await Promise.race([
      attempt.catch((e) => ({ ok: false, reason: String(e?.message ?? e).split('\n')[0] })),
      limit,
    ])
  } finally {
    clearTimeout(timer)
    await browser?.close().catch(() => {})
  }
}
