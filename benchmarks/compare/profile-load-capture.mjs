// Capture one canonical load window and always release its page, profiler and trace stream.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { hash, MAX_TRACE } from './profile-load-pins.mjs'
import { LOAD, metricsFrom } from './profile-load-data.mjs'

/** Serve only pinned regular build outputs from an owned ephemeral loopback listener. */
export async function serveAssets(dist, assets) {
  const errors = []
  const server = createServer((request, response) => {
    try {
      const name =
        decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) ||
        'index.html'
      assert.ok(Object.hasOwn(assets, name), `Unpinned resource: ${name}`)
      const bytes = readFileSync(join(dist, name))
      assert.equal(hash(bytes), assets[name].sha256, `Asset changed: ${name}`)
      const type = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml',
      }[extname(name)]
      response.writeHead(200, { 'content-type': type ?? 'application/octet-stream' })
      response.end(bytes)
    } catch (error) {
      if (errors.length < 20) errors.push(String(error))
      response.writeHead(404)
      response.end('Missing pinned resource')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  return {
    errors,
    url: `http://127.0.0.1:${port}/`,
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

/** Stream traces with a hard decoded-byte limit; never accept a truncated trace. */
export async function readTrace(cdp, handle, limit = MAX_TRACE) {
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const part = await cdp.send('IO.read', { handle, size: 65536 })
      const chunk = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8')
      bytes += chunk.length
      assert.ok(bytes <= limit, 'Trace exceeds decoded-byte cap; capture rejected')
      chunks.push(chunk)
      if (part.eof) return Buffer.concat(chunks)
    }
  } finally {
    await cdp.send('IO.close', { handle })
  }
}

async function endTrace(cdp) {
  let listener, timer
  const completed = new Promise((resolve, reject) => {
    listener = resolve
    cdp.once('Tracing.tracingComplete', listener)
    timer = setTimeout(() => reject(new Error('Trace completion timeout')), 15000)
  })
  try {
    await cdp.send('Tracing.end')
    const result = await completed
    assert.ok(result.stream, 'Missing trace stream')
    if (result.dataLossOccurred) {
      await cdp.send('IO.close', { handle: result.stream })
      throw new Error('Chrome reports trace data loss')
    }
    return await readTrace(cdp, result.stream)
  } finally {
    clearTimeout(timer)
    cdp.off('Tracing.tracingComplete', listener)
  }
}

async function startCapture(cdp) {
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: LOAD.cpuRate })
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: LOAD.sampleIntervalUs })
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: LOAD.categories,
    options: 'record-until-full',
  })
}

async function loadWindow(page, cdp, url, result) {
  result.start =
    (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'Timestamp')
      ?.value * 1000000
  await page.goto(url)
  await page.getByText('Apollo 0', { exact: true }).first().waitFor()
  await page.waitForTimeout(LOAD.settleMs)
  const raw = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]),
  )
  const fcp = await page.evaluate(
    () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
  )
  result.metrics = metricsFrom(raw, fcp)
  result.rawMetrics = raw
  result.end = raw.Timestamp * 1000000
  result.frame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id
  result.dom = await page.evaluate(() => {
    const counts = { elements: 0, text: 0, comments: 0 }
    const walker = document.createTreeWalker(document, -1)
    while (walker.nextNode()) {
      const type = walker.currentNode.nodeType
      if (type === 1) counts.elements++
      else if (type === 3) counts.text++
      else if (type === 8) counts.comments++
    }
    return counts
  })
  for (const name of ['elements', 'text', 'comments'])
    assert.ok(Number.isInteger(result.dom[name]) && result.dom[name] >= 0, 'Invalid DOM count')
}

/** A failed capture returns its available bounded diagnostics; callers must reject it. */
export async function captureTrial(browser, url) {
  const context = await browser.newContext({
    viewport: LOAD.viewport,
    acceptDownloads: false,
  })
  const result = { status: 'error', errors: [], at: new Date().toISOString() }
  let cdp,
    tracing = false,
    profiling = false
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const issue = (message) => {
      if (result.errors.length < 20) result.errors.push(String(message).slice(0, 4096))
    }
    page.on('pageerror', issue)
    page.on('requestfailed', (request) =>
      issue(`request: ${request.url()}: ${request.failure()?.errorText}`),
    )
    page.on('response', (response) => {
      if (!response.ok()) issue(`HTTP ${response.status()} ${response.url()}`)
    })
    cdp = await context.newCDPSession(page)
    await startCapture(cdp)
    tracing = true
    await cdp.send('Profiler.start')
    profiling = true
    await loadWindow(page, cdp, url, result)
    assert.equal(result.errors.length, 0, 'Page/network errors during load')
    result.status = 'ok'
  } catch (error) {
    result.errors.push(String(error))
  } finally {
    if (profiling) {
      try {
        result.cpu = (await cdp.send('Profiler.stop')).profile
      } catch (error) {
        result.errors.push(String(error))
        result.status = 'error'
      }
    }
    if (tracing) {
      try {
        result.trace = await endTrace(cdp)
      } catch (error) {
        result.errors.push(String(error))
        result.status = 'error'
      }
    }
    try {
      await context.close()
    } catch (error) {
      result.errors.push(String(error))
      result.status = 'error'
    }
  }
  return result
}
