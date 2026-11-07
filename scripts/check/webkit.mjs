// Whether this machine's WebKit can open a page. A WebKit that can't (a missing install, or a frozen build for an
// older macOS that rejects what the current playwright-core sends) makes every WebKit test wait out its timeout, so
// the release check asks first and fails at once with the reason. patches/playwright-core@*.patch keeps the macOS 14
// build working.
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
