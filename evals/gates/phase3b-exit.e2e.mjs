// The hidden e2e for evals/gates/phase3b-exit.mjs: the chat room in Chrome (live, history, typing, reconnect and resume,
// after a killed socket and after a reset), then the R-code rules over a raw WebSocket (Origin, `authorize`, bounds).
import { createRequire } from 'node:module'
import { suite } from '../../packages/start/scripts/e2e-todo.mjs'
import { fnId, handshake, open as socket } from '../../packages/start/test/ws-client.mjs'

const { chromium } = createRequire(new URL('../../packages/start/package.json', import.meta.url))(
  'playwright-core',
)

const track = () => {
  const Real = window.WebSocket
  window.__sockets = []
  window.WebSocket = class extends Real {
    constructor(u, ...a) {
      super(u, ...a)
      if (String(u).includes('/_weft/ws')) window.__sockets.push(this)
    }
  }
}

export default async function ({ url, log }) {
  const t = suite({ url, log })
  const { check, eq, user, open, signUp } = t
  const browser = await chromium.launch()
  const room = fnId('room'),
    id = `r${Date.now()}`
  const lines = (page) => page.$$eval('ul.messages li', (l) => l.map((li) => li.textContent.trim()))
  const see = (page, text) =>
    page.locator('ul.messages li', { hasText: text }).first().waitFor({ timeout: 10_000 })
  const status = (page, word) =>
    page.getByRole('status').filter({ hasText: word }).waitFor({ timeout: 15_000 })
  const say = async (page, text) => {
    const box = page.getByLabel('Message')
    await box.fill(text)
    await page.getByRole('button', { name: 'Send' }).click()
    await box.evaluate(
      (el) =>
        new Promise((ok) => {
          const poll = setInterval(() => {
            if (!el.value) {
              clearInterval(poll)
              ok()
            }
          }, 20)
          setTimeout(() => {
            clearInterval(poll)
            ok()
          }, 12_000)
        }),
    ) // the brief empties it on success
  }
  const enter = async (s, where = id) => {
    await s.page.addInitScript(track)
    await s.page.goto(`/chat/${where}`)
    await s.page.waitForLoadState('networkidle')
  }
  const kill = (page) => page.evaluate(() => window.__sockets.at(-1).close())
  const cookie = async (s) => ({
    cookie: (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; '),
  })
  try {
    const a = await open(browser),
      b = await open(browser),
      guest = await open(browser)
    const ann = user('ann'),
      ben = user('ben'),
      tess = { ...user('tess'), email: `tess-${Date.now()}@team.test` }
    await signUp(a.page, ann)
    await signUp(b.page, ben)

    await checkLive({ check, eq, guest, id, a, b, enter, status, say, see, lines })
    await checkReconnect({ check, eq, a, b, status, kill, say, see, lines })
    await checkReset({ check, eq, a, b, status, kill, say, see, lines })
    await checkAccess({ check, eq, a, b, url, id, room, cookie, see, lines })
    await checkTeam({
      check,
      eq,
      a,
      b,
      guest,
      browser,
      tess,
      id,
      url,
      room,
      cookie,
      enter,
      status,
      say,
      see,
      open,
      signUp,
    })
    return { checks: t.checks }
  } finally {
    await browser.close()
  }
}

async function checkLive({ check, eq, guest, id, a, b, enter, status, say, see, lines }) {
  await check('a guest is sent to /login', async () => {
    await guest.page.goto(`/chat/${id}`)
    await guest.page.waitForURL('**/login')
  })
  await check('two users share a room, live, exactly once, and the box empties', async () => {
    await enter(a)
    await enter(b)
    await status(a.page, 'open')
    await status(b.page, 'open')
    await say(a.page, 'hello from ann')
    await see(b.page, 'ann: hello from ann')
    await see(a.page, 'ann: hello from ann')
    eq(await a.page.getByLabel('Message').inputValue(), '', 'the input')
    eq(await lines(b.page), ['ann: hello from ann'], "ben's list")
    eq(await lines(a.page), ['ann: hello from ann'], "ann's list")
  })
  await check('typing shows to the other person, never to yourself, and goes away', async () => {
    await a.page.getByLabel('Message').pressSequentially('hm')
    await b.page.locator('p.typing', { hasText: 'ann is typing' }).waitFor({ timeout: 5000 })
    eq(await a.page.locator('p.typing', { hasText: 'ann is typing' }).count(), 0, "ann's own page")
    await b.page
      .locator('p.typing', { hasText: 'ann is typing' })
      .waitFor({ state: 'hidden', timeout: 6000 })
    await a.page.getByLabel('Message').fill('')
  })
  await check('history is server-rendered after a reload', async () => {
    const res = await a.page.request.get(`/chat/${id}`)
    const html = await res.text()
    if (!html.includes('hello from ann')) throw new Error('the message is not in the HTML')
    await b.page.reload()
    await see(b.page, 'hello from ann')
    eq(await lines(b.page), ['ann: hello from ann'], 'after a reload')
  })
}

async function checkReconnect({ check, eq, a, b, status, kill, say, see, lines }) {
  await check(
    'a killed socket comes back: what was said meanwhile shows, in order, with no duplicates',
    async () => {
      await status(b.page, 'open')
      await kill(b.page)
      await say(a.page, 'during one')
      await say(a.page, 'during two')
      await see(b.page, 'during two')
      await status(b.page, 'open')
      await say(b.page, 'ben is back')
      await see(a.page, 'ben is back')
      eq(
        await lines(b.page),
        ['ann: hello from ann', 'ann: during one', 'ann: during two', 'ben: ben is back'],
        'ben after the drop',
      )
      eq(
        await lines(a.page),
        ['ann: hello from ann', 'ann: during one', 'ann: during two', 'ben: ben is back'],
        'ann after the drop',
      )
    },
  )
  await check('offline for longer: the page ends up right without a reload', async () => {
    await b.context.setOffline(true)
    await kill(b.page)
    for (let i = 0; i < 3; i++) await say(a.page, `missed ${i}`)
    await see(a.page, 'missed 2')
    await new Promise((ok) => {
      setTimeout(ok, 1500)
    })
    await b.context.setOffline(false)
    await see(b.page, 'missed 2')
    await status(b.page, 'open')
    eq(
      (await lines(b.page)).slice(-3),
      ['ann: missed 0', 'ann: missed 1', 'ann: missed 2'],
      'ben after being offline',
    )
  })
}

async function checkReset({ check, eq, a, b, status, kill, say, see, lines }) {
  await check(
    'a reset (a cursor the server cannot replay) still ends up right, from the database',
    async () => {
      // The page's own resume cursor is rewritten to one from a dead server, then the socket is cut.
      await a.page.evaluate(() => {
        // oxlint-disable-next-line typescript/unbound-method -- wrapped below, and called with the socket as `this`
        const send = WebSocket.prototype.send
        WebSocket.prototype.send = function (d) {
          let f
          try {
            f = JSON.parse(d)
          } catch {}
          if (Array.isArray(f) && f[0] === 'j' && f[4]) {
            f[4] = 'gone:1'
            d = JSON.stringify(f)
          }
          return send.call(this, d)
        }
      })
      await kill(a.page)
      await status(a.page, 'open')
      await say(b.page, 'after the reset')
      await see(a.page, 'after the reset')
      const got = await lines(a.page)
      if (!got.includes('ann: hello from ann') || !got.includes('ann: missed 2'))
        throw new Error(`history lost on reset: ${JSON.stringify(got)}`)
      eq(new Set(got).size, got.length, 'duplicates on a reset')
    },
  )
}

async function checkAccess({ check, eq, a, b, url, id, room, cookie, see, lines }) {
  await check('`postSystem` stores and shows live', async () => {
    await a.page.request.post(`/_weft/fn/${fnId('postSystem')}`, {
      headers: { 'content-type': 'application/json', 'x-weft': '1' },
      data: { i: { roomId: id, text: 'maintenance' } },
    })
    await see(a.page, 'system: maintenance')
    await see(b.page, 'system: maintenance')
  })
  await check(
    'a message over 500 characters is refused: nothing stored, nothing fanned out',
    async () => {
      const s = await socket(url, await cookie(a))
      await s.until('h')
      s.send('j', 1, room, { roomId: id })
      await s.until('j')
      s.send('m', 1, 1, 'say', { text: 'x'.repeat(501) })
      const ack = await s.until('a')
      if (!ack[3]) throw new Error('the long message was accepted')
      s.close()
      await b.page.reload()
      await see(b.page, 'hello from ann')
      if ((await lines(b.page)).some((l) => l.includes('xxxx')))
        throw new Error('the long message was stored')
    },
  )
  await check('R010/R004: another Origin, and no Origin, are refused at the upgrade', async () => {
    eq(
      await handshake(url, { origin: 'http://evil.example', ...(await cookie(a)) }),
      403,
      'another origin',
    )
    eq(await handshake(url, await cookie(a)), 403, 'no origin')
  })
  await check('R011: a guest cannot join; `authorize` is really the check', async () => {
    const s = await socket(url)
    await s.until('h')
    s.send('j', 1, room, { roomId: id })
    eq((await s.until('e'))[2].code, 'R011', 'a guest join')
    s.close()
  })
}

async function checkTeam({
  check,
  eq,
  a,
  b,
  guest,
  browser,
  tess,
  id,
  url,
  room,
  cookie,
  enter,
  status,
  say,
  see,
  open,
  signUp,
}) {
  await check('a team room: closed to others, in the socket, the query and the page', async () => {
    const team = `team-${id}`
    const s = await socket(url, await cookie(a))
    await s.until('h')
    s.send('j', 1, room, { roomId: team })
    eq((await s.until('e'))[2].code, 'R011', 'ann joining a team room')
    s.close()
    await enter(a, team)
    await a.page.getByRole('alert').filter({ hasText: 'Not allowed' }).waitFor({ timeout: 10_000 })

    const c = await open(browser)
    await signUp(c.page, tess)
    await enter(c, team)
    await status(c.page, 'open')
    await say(c.page, 'team secret')
    await see(c.page, 'tess: team secret')

    const read = await fetch(
      `${url}/_weft/fn/${fnId('listMessages')}?i=${encodeURIComponent(JSON.stringify({ roomId: team }))}`,
      { headers: await cookie(a) },
    ).then((r) => r.text())
    if (read.includes('team secret')) throw new Error('`listMessages` leaked a team room')
    const page = await a.page.request.get(`/chat/${team}`).then((r) => r.text())
    if (page.includes('team secret')) throw new Error('the page leaked a team room')
  })
  await check('no page errors', () => {
    eq([...a.errors, ...b.errors, ...guest.errors], [], 'page errors')
  })
}
