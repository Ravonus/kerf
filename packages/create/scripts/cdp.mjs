// A headless Chrome for the packed gates, driven over its debugging protocol with nothing but a WebSocket, so it works
// from Node, Bun and Deno alike and adds no dependency. `CHROME` names the binary; otherwise the usual places are tried.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLACES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

export const findChrome = () => PLACES.find((p) => p && existsSync(p))

export async function launch(exe = findChrome()) {
  const profile = mkdtempSync(join(tmpdir(), 'weft-chrome-'))
  const chrome = spawn(
    exe,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  /** Chrome and its profile go whenever the caller is done with them, or a launch didn't get that far. */
  const stop = async () => {
    chrome.kill('SIGKILL')
    await new Promise((ok) => {
      setTimeout(ok, 300)
    })
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
  }
  let ws
  try {
    const url = await debuggerUrl(chrome)
    ws = new WebSocket(url)
    await new Promise((ok, no) => {
      ws.onopen = ok
      ws.onerror = () => no(new Error('no Chrome debugger'))
    })
  } catch (e) {
    await stop()
    throw e
  }
  let id = 0
  const waiting = new Map(),
    listeners = new Set()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id) {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      m.error ? w.no(new Error(m.error.message)) : w.ok(m.result)
    } else for (const l of listeners) l(m)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, no) => {
      waiting.set(++id, { ok, no })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  return {
    /** A new page. `eval` runs an expression in it, awaiting a promise; `loads` counts the document loads seen. */
    async page(url) {
      return openPage(send, listeners, url)
    },
    async close() {
      ws.close()
      await stop()
    },
  }
}

async function openPage(send, listeners, url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const page = { loads: 0, errors: [] }
  listeners.add((m) => {
    if (m.sessionId !== sessionId) return
    if (m.method === 'Page.loadEventFired') page.loads++
    if (m.method === 'Runtime.exceptionThrown')
      page.errors.push(
        m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
      )
  })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  page.eval = async (expression) => {
    const r = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  /** Real key presses in whatever has focus. */
  page.type = async (text) => {
    for (const c of text) await send('Input.dispatchKeyEvent', { type: 'char', text: c }, sessionId)
  }
  await send('Page.navigate', { url }, sessionId)
  return page
}

function debuggerUrl(chrome) {
  return new Promise((ok, no) => {
    let log = ''
    const timer = setTimeout(() => no(new Error(`Chrome didn't start: ${log.slice(-400)}`)), 30000)
    chrome.on('error', (e) => {
      clearTimeout(timer)
      no(e)
    })
    chrome.on('exit', (code) => {
      clearTimeout(timer)
      no(new Error(`Chrome exited with ${code} before it started: ${log.slice(-400)}`))
    })
    chrome.stderr.on('data', (d) => {
      log += d
      const m = log.match(/ws:\/\/\S+/)
      if (m) {
        clearTimeout(timer)
        ok(m[0])
      }
    })
  })
}
