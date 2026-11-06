// The `weft browser` transport: commands go to the dev server, which relays them to an open tab of the app (@weft-js/core/agent
// in the page). No browser automation library: the page is whatever browser the agent or person already has open. When
// there is none (CI, a sandbox), `launch` starts a plain headless Chrome on the app as a host page, and `screenshot`
// reads it over the DevTools protocol.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../load-config.mjs'

/** The dev server: `--url`, else what the weft() plugin wrote to `.weft/dev.json`, else `environments.dev.url`. */
export async function devUrl(root, given) {
  if (given) return given.replace(/\/$/, '')
  const file = join(root, '.weft', 'dev.json')
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')).url.replace(/\/$/, '')
    } catch {}
  }
  const { config } = await loadConfig(root).catch(() => ({ config: {} }))
  return (config.environments?.dev?.url ?? 'http://localhost:5173').replace(/\/$/, '')
}

const fail = (code, message, extra) => Object.assign(new Error(message), { code, ...extra })

async function request(url, init) {
  try {
    const res = await fetch(`${url}/__weft/agent`, {
      ...init,
      headers: { 'x-weft-agent': '1', 'content-type': 'application/json' },
    })
    if (res.status === 404)
      throw fail(
        'E_NO_BRIDGE',
        `${url} is not a weft dev server (no /__weft/agent): serve the app with the weft() Vite plugin`,
      )
    return await res.json()
  } catch (e) {
    if (e.code) throw e
    throw fail('E_NO_DEV', `no dev server answers at ${url}: start it (vite), or pass --url`)
  }
}

/** Run one command in a tab (the focused one, else the most recent). */
export async function call(root, cmd, args = {}, { url, tab, timeout } = {}) {
  const base = await devUrl(root, url)
  const out = await request(base, {
    method: 'POST',
    body: JSON.stringify({ cmd, args, tab, timeout }),
  })
  if (!out.ok) throw fail(out.code ?? 'E_PAGE', out.error, { tabs: out.tabs })
  return out.result
}

export async function tabs(root, { url } = {}) {
  const base = await devUrl(root, url)
  const out = await request(base, { method: 'GET' })
  return { url: base, agent: out.agent, tabs: out.tabs }
}

/** Wait until a tab is connected (after `launch` or `navigate`). */
export async function waitForTab(root, { url, ms = 15_000, check } = {}) {
  const until = Date.now() + ms
  for (;;) {
    check?.()
    try {
      const t = await tabs(root, { url })
      if (t.tabs.length) return t
    } catch (e) {
      if (Date.now() > until) throw e
    }
    if (Date.now() > until) throw fail('E_NO_TAB', 'no tab connected in time')
    await new Promise((r) => {
      setTimeout(r, 150)
    })
  }
}

// ---- a host page when the agent has no browser ------------------------------------------------------------------

const chromes = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
}

export function findChrome() {
  const env = process.env.WEFT_CHROME ?? process.env.CHROME_PATH
  if (env && existsSync(env)) return env
  return (chromes[process.platform] ?? []).find((p) => existsSync(p)) ?? null
}

const stateFile = (root) => join(root, '.weft', 'browser', 'chrome.json')

/** Start a headless Chrome on `route` (a plain page; @weft-js/core/agent in it connects back to the dev server). */
export async function launch(root, route = '/', { url, headed = false } = {}) {
  const exe = findChrome()
  if (!exe)
    throw fail(
      'E_NO_CHROME',
      'no Chrome or Chromium found; open the app in your own browser instead, or set WEFT_CHROME',
    )
  close(root)
  const base = await devUrl(root, url)
  const profile = join(root, '.weft', 'browser', 'profile')
  mkdirSync(profile, { recursive: true })
  const args = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...(headed ? [] : ['--headless=new']),
    ...(process.getuid?.() === 0
      ? ['--no-sandbox']
      : []) /* Chrome won't start as root with its sandbox: a container, CI */,
    `${base}${route.startsWith('/') ? route : `/${route}`}`,
  ]
  const child = spawn(exe, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = '',
    failure = null
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4096)
  })
  child.on('error', (error) => {
    failure = `spawn: ${error.message}`
  })
  child.on('exit', (code, signal) => {
    failure = `exit: ${code}, signal: ${signal}`
  })
  child.unref()
  child.stderr.unref?.()
  writeFileSync(stateFile(root), JSON.stringify({ pid: child.pid, profile, exe }))
  try {
    const t = await waitForTab(root, {
      url,
      check: () => {
        if (failure) throw fail('E_CHROME', `Chrome ${failure}; stderr: ${stderr}`)
      },
    })
    return { launched: true, pid: child.pid, headless: !headed, ...t }
  } catch (error) {
    close(root)
    child.stderr.destroy()
    error.message += ` (Chrome ${failure ?? 'still running'}; stderr: ${stderr})`
    throw error
  }
}

export function close(root) {
  const file = stateFile(root)
  if (!existsSync(file)) return { closed: false }
  const { pid } = JSON.parse(readFileSync(file, 'utf8'))
  try {
    process.kill(pid)
  } catch {}
  rmSync(file, { force: true })
  return { closed: true, pid }
}

/** A PNG of the launched Chrome's page (DevTools protocol). An agent's own browser takes its own screenshots. */
export async function screenshot(root, out) {
  const file = stateFile(root)
  if (!existsSync(file))
    throw fail(
      'E_NO_CHROME',
      'screenshot needs `weft browser launch`; in your own browser, use its screenshot tool',
    )
  const { profile } = JSON.parse(readFileSync(file, 'utf8'))
  const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw fail('E_NO_TAB', 'the launched Chrome has no page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = () => no(fail('E_CDP', 'could not reach the page over the DevTools protocol'))
  })
  const data = await new Promise((ok, no) => {
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id !== 1) return
      if (m.error) no(fail('E_CDP', m.error.message))
      else ok(m.result.data)
    }
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }))
  })
  ws.close()
  const path = out ?? join(root, '.weft', 'browser', `screenshot-${Date.now()}.png`)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.from(data, 'base64'))
  return { path }
}

/** Big payloads go to a file; the reply holds the path (research 05: snapshots pile up in context). */
export function spill(root, name, text, limit = 8000) {
  if (typeof text !== 'string' || text.length <= limit) return text
  const path = join(root, '.weft', 'browser', `${name}-${Date.now()}.txt`)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return { path, chars: text.length, head: `${text.slice(0, 1200)}\n…` }
}
