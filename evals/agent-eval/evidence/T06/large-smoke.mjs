// Real-browser smoke of one owned reference; no model or general evaluation.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { passwordIsHashed, requireListener, requireRefusal } from './large-smoke-checks.mjs'

const { WEFT_T06_APP: app, WEFT_T06_RECEIPTS: receipts, WEFT_EVAL_DEPS: deps } = process.env
if (!app || !receipts || !deps) throw new Error('missing owned smoke configuration')
process.chdir(app)
const require = createRequire(join(deps, 'package.json'))
const { chromium } = require('playwright-core')
const base = 'http://127.0.0.1:4173'
const port = '4173'
const password = `fixture-${crypto.randomUUID()}`
const addresses = [`a-${crypto.randomUUID()}@example.test`, `b-${crypto.randomUUID()}@example.test`]
const sessionSecret = readFileSync(join(app, '.env'), 'utf8').match(
  /^BETTER_AUTH_SECRET=(.*)$/m,
)?.[1]
if (!sessionSecret) throw new Error('missing disposable fixture secret')
const pids = () => {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  })
  if (result.status !== 0 && result.status !== 1) throw new Error('inconclusive: lsof failed')
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/).map(Number) : []
}
if (pids().length) throw new Error('inconclusive: fixed origin port already in use')
const server = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs'],
  {
    cwd: app,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: port,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: sessionSecret,
      DATABASE_URL: `file:${join(app, '.data/app.db')}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let output = ''
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (chunk) => {
    output += chunk.toString()
    if (output.length > 2 * 1024 * 1024) server.kill('SIGTERM')
  })
const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    const detail = String(error.message)
    const message =
      detail.length <= 65536
        ? detail
        : `inconclusive: diagnostic exceeded 64 KiB\n${detail.slice(0, 65536)}`
    results.push({ name, ok: false, error: message })
    throw error
  }
}
const button = (page, name) => page.getByRole('button', { name, exact: true })
const signup = async (page, email) => {
  await page.goto(`${base}/signup`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await button(page, 'Sign up').click()
  await page.getByText(`Signed in as ${email}`, { exact: true }).waitFor()
}
const visible = async (locator, assertion, timeout = 5000) => {
  try {
    await locator.waitFor({ timeout })
  } catch (error) {
    if (/timeout/i.test(String(error.message))) {
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error(`inconclusive:${assertion}: server exited`, { cause: error })
      try {
        requireListener(pids(), server.pid)
        const response = await fetch(base, { signal: AbortSignal.timeout(2000) })
        if (response.status >= 500) throw new Error('server error', { cause: error })
      } catch (failure) {
        throw new Error(`inconclusive:${assertion}: server unavailable`, { cause: failure })
      }
      throw new Error(`assertion:${assertion}`, { cause: error })
    }
    throw new Error(`inconclusive:${assertion}: ${error.message}`, { cause: error })
  }
}
const credentials = async (page, action, address, value) => {
  await page.goto(`${base}/${action === 'Sign up' ? 'signup' : 'signin'}`)
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password').fill(value)
  await button(page, action).click()
}
const capture = (page, input) =>
  page.waitForRequest((request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.startsWith('/_weft/fn/'))
      return false
    try {
      return input(request.postDataJSON()?.i)
    } catch {
      return false
    }
  })
const replay = (context, url, input, origin = base) =>
  context.request.post(url, {
    headers: { origin, 'x-weft': '1', 'content-type': 'application/json' },
    data: { i: input },
  })
let browser
try {
  await step('owned listener', async () => {
    for (let i = 0; i < 150; i++) {
      if (server.exitCode !== null) throw new Error('inconclusive: server exited before readiness')
      const found = pids()
      if (found.length) {
        requireListener(found, server.pid)
        const response = await fetch(base, { signal: AbortSignal.timeout(2000) })
        if (response.status >= 500) throw new Error(`server returned ${response.status}`)
        return
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
    }
    throw new Error('inconclusive: server did not listen')
  })
  browser = await chromium.launch()
  const first = await browser.newContext(),
    second = await browser.newContext()
  const a = await first.newPage(),
    b = await second.newPage()
  await step('anonymous redirect', async () => {
    await a.goto(base)
    await a.waitForURL((url) => url.pathname === '/signin')
  })
  await step('two sessions and password storage', async () => {
    await signup(a, addresses[0])
    await signup(b, addresses[1])
    for (const context of [first, second])
      if (!(await context.cookies()).some((cookie) => cookie.httpOnly))
        throw new Error('missing httpOnly cookie')
    const db = new DatabaseSync(join(app, '.data/app.db'), { readOnly: true })
    try {
      passwordIsHashed(
        db.prepare('SELECT password FROM account WHERE password IS NOT NULL').all(),
        password,
      )
    } finally {
      db.close()
    }
  })
  await step('credential errors and sign in', async () => {
    await button(b, 'Sign out').click()
    await credentials(b, 'Sign in', addresses[1], 'incorrect-fixture-password')
    await visible(b.getByText('Invalid email or password', { exact: true }), 'wrong-password')
    await credentials(b, 'Sign up', addresses[1], password)
    await visible(b.getByText('Email already in use', { exact: true }), 'duplicate-email')
    await credentials(b, 'Sign in', addresses[1], password)
    await visible(b.getByText(`Signed in as ${addresses[1]}`, { exact: true }), 'sign-in')
  })
  await step('client validation', async () => {
    let release
    const hold = new Promise((resolve) => {
      release = resolve
    })
    const intercept = async (route) => {
      if (route.request().method() === 'POST') await hold
      await route.continue()
    }
    await a.route('**/_weft/fn/**', intercept)
    try {
      await a.getByLabel('Message').fill('x'.repeat(281))
      await button(a, 'Post').click()
      await visible(a.getByText('Too long', { exact: true }), 'ui-too-long', 1000)
    } finally {
      release()
      await a.unroute('**/_weft/fn/**', intercept)
    }
  })
  let postRequest, messageId
  await step('live post and presence', async () => {
    await visible(a.getByText('2 online', { exact: true }), 'presence', 10000)
    await visible(b.getByText('2 online', { exact: true }), 'presence', 10000)
    let release
    const hold = new Promise((resolve) => {
      release = resolve
    })
    const intercept = async (route) => {
      const request = route.request()
      let body
      try {
        body = request.postDataJSON()?.i
      } catch {}
      if (body?.text === 'owned message') await hold
      await route.continue()
    }
    await a.route('**/_weft/fn/**', intercept)
    const pending = capture(a, (input) => input?.text === 'owned message')
    await a.getByLabel('Message').fill('owned message')
    const started = Date.now()
    try {
      await button(a, 'Post').click()
      const ownRemaining = 1000 - (Date.now() - started)
      if (ownRemaining <= 0) throw new Error('inconclusive: own-post observation started late')
      await visible(a.getByText('owned message', { exact: true }), 'own-immediate', ownRemaining)
    } finally {
      release()
      await a.unroute('**/_weft/fn/**', intercept)
    }
    postRequest = await pending
    messageId = postRequest.postDataJSON().i.id
    const remaining = 2000 - (Date.now() - started)
    if (remaining <= 0) throw new Error('inconclusive: live deadline elapsed before observation')
    await visible(b.getByText('owned message', { exact: true }), 'remote-post', remaining)
    if (await button(b, 'Delete owned message').count())
      throw new Error('assertion:non-author-button')
  })
  await step('server validation and cross-origin refusal', async () => {
    const blank = await replay(first, postRequest.url(), { id: crypto.randomUUID(), text: '   ' })
    requireRefusal(blank.status(), 'assertion:blank-message', 400, 'Q002', await blank.json())
    const tooLong = await replay(first, postRequest.url(), {
      id: crypto.randomUUID(),
      text: 'x'.repeat(281),
    })
    requireRefusal(tooLong.status(), 'assertion:server-too-long', 400, 'Q002', await tooLong.json())
    const cross = await replay(
      first,
      postRequest.url(),
      { id: crypto.randomUUID(), text: 'cross-origin' },
      'https://untrusted.example',
    )
    requireRefusal(cross.status(), 'cross-origin post', 403, 'Q010', await cross.json())
    const bypass = async (route) => {
      const request = route.request()
      let body
      try {
        body = request.postDataJSON()
      } catch {}
      if (body?.i?.text === 'server-limit-probe') {
        body.i.text = 'x'.repeat(281)
        await route.continue({ postData: JSON.stringify(body) })
      } else await route.continue()
    }
    await a.route(postRequest.url(), bypass)
    try {
      await a.getByLabel('Message').fill('server-limit-probe')
      await button(a, 'Post').click()
      await visible(a.getByText('Too long', { exact: true }), 'server-too-long-ui')
    } finally {
      await a.unroute(postRequest.url(), bypass)
    }
  })
  await step('server author enforcement and live deletion', async () => {
    await b.getByLabel('Message').fill('reader message')
    await button(b, 'Post').click()
    const newest = b.getByRole('list', { name: 'Messages' }).getByRole('listitem').first()
    await visible(newest.getByText('reader message', { exact: true }), 'newest-first')
    await visible(newest.getByText(addresses[1], { exact: true }), 'author-email')
    const pending = capture(b, (input) => typeof input?.id === 'string' && !('text' in input))
    await button(b, 'Delete reader message').click()
    const ownDelete = await pending
    const stolen = await replay(second, ownDelete.url(), { id: messageId })
    requireRefusal(stolen.status(), 'assertion:author-delete', 404)
    await a.getByText('owned message', { exact: true }).waitFor()
    await button(a, 'Delete owned message').click()
    await b
      .getByText('owned message', { exact: true })
      .waitFor({ state: 'detached', timeout: 2000 })
  })
  await step('presence disconnect', async () => {
    await second.close()
    await a.getByText('1 online', { exact: true }).waitFor({ timeout: 10000 })
  })
  await first.close()
} catch (error) {
  process.exitCode = 1
  console.error(
    String(error.message)
      .replaceAll(sessionSecret, '[redacted]')
      .replaceAll(password, '[redacted]')
      .slice(0, 1000),
  )
} finally {
  if (browser) await browser.close()
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolve) => {
      server.once('close', resolve)
    })
    server.kill('SIGTERM')
    const deadline = setTimeout(() => {
      server.kill('SIGKILL')
    }, 3000)
    await stopped
    clearTimeout(deadline)
  }
  if (output.length > 2 * 1024 * 1024) {
    results.push({ name: 'server log bound', ok: false, error: 'server log exceeded 2 MiB' })
    process.exitCode = 1
  }
  writeFileSync(
    join(receipts, 'runtime-smoke.json'),
    JSON.stringify(results, null, 2)
      .replaceAll(sessionSecret, '[redacted]')
      .replaceAll(password, '[redacted]') + '\n',
  )
  writeFileSync(
    join(receipts, 'runtime-server.log'),
    output
      .replaceAll(sessionSecret, '[redacted]')
      .replaceAll(password, '[redacted]')
      .slice(0, 2 * 1024 * 1024),
  )
}
