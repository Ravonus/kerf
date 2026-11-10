// Whether the browser can scroll an area and move its thumb without the main thread, as Chromium's layer tree says:
//   composited   the viewport scrolls on its own compositor layer
//   thumb        the thumb is layered for a running transform animation (the scroll timeline), so the compositor
//                moves it
//   blocking     wheel or touch listeners on the area or above it that are not passive, beyond the plain page's
//                (Playwright adds one): each one sends scrolling back through the main thread
// for plain `overflow: auto`, native mode (DOM bars, then canvas bars) and engine mode, at a device pixel ratio of 2.
//   node bench/compositor.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { rolldown } = require('rolldown')
const at = (p) => fileURLToPath(new URL(p, import.meta.url))
const build = await rolldown({ input: at('../test/fixtures/browser-entry.ts') })
const code = (await build.generate({ format: 'iife', name: 'scroll_' })).output[0].code
const css = readFileSync(at('../styles/scroll.css'), 'utf8')
const rows = Array.from({ length: 200 }, (_, i) => `<p style="margin:0;height:40px">Row ${i}</p>`).join('')
const area = `<div id="r" style="width:400px;height:400px"><div data-part="viewport" style="height:100%;overflow:auto"><div data-part="content">${rows}</div></div></div>`

async function inspect(browser, mode) {
  const p = await browser.newPage({ viewport: { width: 500, height: 500 }, deviceScaleFactor: 2 })
  await p.setContent(`<!doctype html><style>body{margin:0}${mode === 'plain' ? '' : css}</style>${area}`)
  await p.addScriptTag({ content: code })
  if (mode !== 'plain')
    await p.evaluate((m) => {
      const o = { bar: { show: 'always' } }
      if (m === 'canvas') o.renderer = window.scroll_.canvas()
      else o.mode = m
      window.scroll_.scroller(document.getElementById('r'), o)
    }, mode)
  await p.evaluate(() => {
    document.querySelector('#r [data-part="viewport"]').scrollTop = 400
  })
  await p.waitForTimeout(300)
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('DOM.enable')
  await cdp.send('LayerTree.enable')
  const layers = await new Promise((resolve) => {
    cdp.on('LayerTree.layerTreeDidChange', (e) => e.layers && resolve(e.layers))
    p.evaluate(() => {
      document.body.style.outline = '1px solid transparent'
    })
  })
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const find = async (sel) => (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel })).nodeId
  const backend = async (sel) => {
    const id = await find(sel)
    return id ? (await cdp.send('DOM.describeNode', { nodeId: id })).node.backendNodeId : -1
  }
  const reasons = async (node) => {
    const own = layers.filter((l) => l.backendNodeId === node)
    const out = []
    for (const l of own)
      out.push(...(await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds)
    return out
  }
  const vp = await reasons(await backend('#r [data-part="viewport"]'))
  const thumb = await reasons(await backend('[data-orientation="vertical"] [data-part="thumb"]'))
  let blocking = 0
  for (const sel of ['#r [data-part="viewport"]', '#r', 'body', 'html']) {
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: await find(sel) })
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.objectId })
    blocking += listeners.filter((l) => /^(wheel|mousewheel|touchstart|touchmove)$/.test(l.type) && !l.passive).length
  }
  const win = await cdp.send('Runtime.evaluate', { expression: 'window' })
  const top = await cdp.send('DOMDebugger.getEventListeners', { objectId: win.result.objectId })
  const tops = top.listeners.filter((l) => /^(wheel|mousewheel|touchstart|touchmove)$/.test(l.type) && !l.passive)
  blocking += tops.length
  await p.close()
  return {
    composited: vp.some((r) => /scroll/i.test(r)),
    thumb: thumb.some((r) => /animation/i.test(r)),
    blocking,
    viewportReasons: vp.join(' ') || '-',
    thumbReasons: thumb.join(' ') || '-',
  }
}

const browser = await chromium.launch()
const plain = await inspect(browser, 'plain')
for (const mode of ['plain', 'native', 'canvas', 'engine']) {
  const r = mode === 'plain' ? plain : await inspect(browser, mode)
  console.log(mode, { ...r, blocking: r.blocking - plain.blocking })
}
await browser.close()
