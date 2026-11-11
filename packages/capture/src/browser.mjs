// Headless Chrome on the GPU, and a page opened at a device's size. One launch for every driver in this package.
import { chromium } from 'playwright-core'

const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** Chrome's flags for drawing on the GPU without a window: ANGLE on Metal on macOS, the blocklist off everywhere. */
export function gpuArgs(platform = process.platform) {
  return [
    ...(platform === 'darwin' ? ['--use-angle=metal'] : []),
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ]
}

/** Launches Chrome headless on the GPU: the installed Chrome, or `executablePath`; `tmp` sets a short TMPDIR. */
export function launch(options = {}) {
  const { headless = true, channel = 'chrome', executablePath, tmp } = options
  return chromium.launch({
    headless,
    ...(executablePath ? { executablePath } : { channel }),
    args: gpuArgs(),
    ...(tmp ? { env: { ...process.env, TMPDIR: tmp } } : {}),
  })
}

/** Opens `url` in a fresh context at a device's size; page and console errors land on `page.problems`. */
export async function open(browser, options) {
  const {
    url,
    width = 1440,
    height = 900,
    dpr = 1,
    reduced = false,
    mobile = false,
    cpu = 1,
  } = options
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    ...(mobile ? { isMobile: true, hasTouch: true, userAgent: PHONE } : {}),
  })
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) problems.push(m.text())
  })
  if (cpu > 1) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  }
  await page.goto(url, { waitUntil: 'load' })
  return Object.assign(page, { problems })
}

/** The GPU the page draws with, as WebGL reports it: proof a run was not on a software rasteriser. */
export function gpuOf(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return renderer
  })
}
