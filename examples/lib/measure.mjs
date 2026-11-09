// One sample of each thing bench.mjs medians: a Lighthouse run, a browser pass and a short load.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Playwright's own Chromium, except with BENCH_CHROME, and on Windows, where installed Chrome is used if it's there.
const WINDOWS_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const chrome =
  process.env.BENCH_CHROME ??
  (process.platform === 'win32' && existsSync(WINDOWS_CHROME) ? WINDOWS_CHROME : undefined)
export const launchBrowser = () => chromium.launch(chrome ? { executablePath: chrome } : {})
export const chromePath = () => chrome ?? chromium.executablePath()

// Lighthouse keeps global state (its performance marks), so runs that overlap each get a process.
const LIGHTHOUSE = fileURLToPath(new URL('lighthouse-run.mjs', import.meta.url))
const once = (args) =>
  new Promise((ok, no) =>
    execFile(
      process.execPath,
      [LIGHTHOUSE, JSON.stringify(args)],
      { maxBuffer: 1 << 26 },
      (e, out, err) =>
        e ? no(new Error(String(err).slice(-400) || e.message)) : ok(JSON.parse(out)),
    ),
  )

/** Chrome occasionally drops the connection on a busy machine: that's a lost sample, not a result, so take it again. */
async function retried(args) {
  for (let i = 1; ; i++) {
    try {
      return await once(args)
    } catch (e) {
      if (i === 3) throw e
    }
  }
}
export const lighthouseRun = (url, formFactor, keepTo, cookie) =>
  retried({ url, formFactor, keepTo, cookie, chrome: chromePath() })
/** Mobile Lighthouse with the network and CPU really slowed, so LCP and its phases come from one trace of one load. */
export const lighthouseThrottled = (url, cookie) =>
  retried({ url, cookie, real: true, chrome: chromePath() })

export { bytesPass } from './measure/bytes.mjs'
export { hydrationPass } from './measure/hydration.mjs'
export { loadPass } from './measure/load.mjs'
