// The scaffold's e2e (research 28 §5): what `create-weft --db sqlite --auth` promises, on a production server, in
// Chrome and over HTTP. Selectors are roles and labels, so it holds for every `--ui`. Credentials are generated here;
// nothing leaves the local server.
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright-core')

export function suite({ url, log }) {
  const checks = []
  const check = async (name, fn) => {
    await fn()
    checks.push(name)
    log(`ok ${name}`)
  }
  const fail = m => { throw new Error(m) }
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
  const user = name => ({ name, email: `${name}-${randomBytes(4).toString('hex')}@test.local`, password: randomBytes(12).toString('base64url') })
  const open = async browser => {
    const context = await browser.newContext({ baseURL: url })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    return { context, page, errors }
  }
  const hydrated = page => page.waitForLoadState('networkidle')
  const signUp = async (page, u) => {
    await page.goto('/login')
    await hydrated(page)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Name').fill(u.name)
    await page.getByLabel('Email').fill(u.email)
    await page.getByLabel('Password').fill(u.password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/todos')
    await hydrated(page)
  }
  const signIn = async (page, u) => {
    await page.goto('/login')
    await hydrated(page)
    await page.getByLabel('Email').fill(u.email)
    await page.getByLabel('Password').fill(u.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/todos')
    await hydrated(page)
  }
  const signOut = async page => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL('**/login')
    await hydrated(page)
  }
  const add = async (page, title) => {
    await page.getByLabel('New todo').fill(title)
    await page.getByRole('button', { name: 'Add' }).click()
    await page.locator('ul.todos li', { hasText: title }).first().waitFor()
  }
  const titles = page => page.$$eval('ul.todos li', l => l.map(li => `${li.className}:${li.querySelector('label')?.textContent.trim()}`))
  return { checks, check, fail, eq, user, open, hydrated, signUp, signIn, signOut, add, titles }
}

export async function base(t, { url, browser }) {
  const { check, eq, fail, user, open, hydrated, signUp, signIn, signOut, add, titles } = t
  const alice = user('alice'), bob = user('bob')

  await check('a visitor to /todos gets a 307 to /login, from the layout guard', async () => {
    const r = await fetch(url + '/todos', { redirect: 'manual' })
    eq([r.status, r.headers.get('location')], [307, '/login'], 'guard')
  })
  await check('Better Auth is mounted at /api/auth', async () => eq((await fetch(url + '/api/auth/ok')).status, 200, '/api/auth/ok'))

  const a = await open(browser)
  await check('wrong credentials show the error and stay on /login', async () => {
    await a.page.goto('/login')
    await hydrated(a.page)
    await a.page.getByLabel('Email').fill(alice.email)
    await a.page.getByLabel('Password').fill(alice.password)
    await a.page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await a.page.getByRole('alert').waitFor()
    eq(new URL(a.page.url()).pathname, '/login', 'path')
  })
  await check('sign-up lands on /todos, signed in', () => signUp(a.page, alice))
  await check('add, toggle and delete work, each through the optimistic path', async () => {
    await add(a.page, 'Write the note')
    await add(a.page, 'Run the matrix')
    await add(a.page, 'Ship it')
    eq(await titles(a.page), ['open:Write the note', 'open:Run the matrix', 'open:Ship it'], 'list')
    await a.page.getByRole('button', { name: 'Delete Ship it' }).click()
    await a.page.locator('ul.todos li', { hasText: 'Ship it' }).waitFor({ state: 'detached' })
  })
  await check('a toggle writes at most one attribute in the list', async () => {
    await a.page.waitForLoadState('networkidle')
    await a.page.evaluate(() => {
      window.__w = []
      window.__mo = new MutationObserver(r => window.__w.push(...r.map(x => `${x.type}:${x.target.nodeName}.${x.attributeName ?? ''}`)))
      window.__mo.observe(document.querySelector('ul.todos'), { subtree: true, childList: true, characterData: true, attributes: true })
    })
    // Not `networkidle`: a page that reached it once reports it at once, and the row flips optimistically before the write lands.
    const written = a.page.waitForResponse(r => r.url().includes('/_weft/fn/') && r.request().method() === 'POST')
    await a.page.locator('ul.todos li', { hasText: 'Write the note' }).getByRole('checkbox').click()
    await a.page.locator('ul.todos li.done').waitFor()
    await written
    await a.page.waitForTimeout(100) // the refetch that follows
    const writes = await a.page.evaluate(() => (window.__w.push(...window.__mo.takeRecords().map(x => x.type)), window.__w))
    if (writes.length > 1) fail(`toggle wrote ${JSON.stringify(writes)}`)
  })
  await check('a reload renders the list on the server and hydrates with no fetch and no writes', async () => {
    const calls = []
    const listen = r => { if (r.url().includes('/_weft/fn/')) calls.push(r.url()) }
    a.page.on('request', listen)
    await a.page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const ul = document.querySelector('ul.todos')
        if (!ul) return
        window.__h = []
        new MutationObserver(r => window.__h.push(...r.map(x => x.type))).observe(ul, { subtree: true, childList: true, characterData: true, attributes: true })
      })
    })
    await a.page.reload()
    await a.page.waitForLoadState('networkidle')
    a.page.off('request', listen)
    eq(calls, [], 'fetches during hydration')
    eq(await a.page.evaluate(() => window.__h), [], 'writes during hydration')
    const html = await (await a.context.request.get('/todos')).text()
    if (!html.includes('Run the matrix')) fail('the server-rendered page lacks the list')
    eq(await titles(a.page), ['done:Write the note', 'open:Run the matrix'], 'after reload')
  })
  await check('sign-out is a full load: the client cache is gone and /todos redirects', async () => {
    await a.page.evaluate(() => (window.__same = true))
    await signOut(a.page)
    eq(await a.page.evaluate(() => window.__same), undefined, 'same document after sign-out')
    await a.page.goto('/todos')
    eq(new URL(a.page.url()).pathname, '/login', 'path after sign-out')
  })

  const b = await open(browser)
  await check('a second user sees none of the first user\'s todos', async () => {
    await signUp(b.page, bob)
    await b.page.waitForLoadState('networkidle')
    eq(await titles(b.page), [], 'bob\'s list')
  })
  await check('the first user signs back in to the same list', async () => {
    await signIn(a.page, alice)
    await a.page.waitForLoadState('networkidle')
    eq(await titles(a.page), ['done:Write the note', 'open:Run the matrix'], 'list')
  })

  // A real id for the checks below: the page's own payload.
  const cached = await a.page.evaluate(() => JSON.parse(document.getElementById('weft-cache')?.textContent ?? '[]'))
  const list = cached.find(w => Array.isArray(w[2]) && w[2][0]?.title)
  const aliceId = list[2][0].id
  const ids = await functionIds(url, a.context)
  const post = (ctx, name, input) => ctx.request.post(`/_weft/fn/${ids[name]}`, { headers: { 'content-type': 'application/json', 'x-weft': '1' }, data: { i: input, f: [] } })

  await check('a user can\'t change another user\'s todo by its id', async () => {
    eq((await post(b.context, 'toggleTodo', { id: aliceId })).status(), 200, 'status')
    eq((await post(b.context, 'deleteTodo', { id: aliceId })).status(), 200, 'status')
    await a.page.reload()
    await a.page.waitForLoadState('networkidle')
    eq((await titles(a.page))[0], 'done:Write the note', 'alice\'s todo')
  })
  await check('A002: a call with no session is a 401', async () => {
    const r = await fetch(`${url}/_weft/fn/${ids.listTodos}`)
    eq([r.status, (await r.json()).e.code], [401, 'A002'], 'anonymous query')
  })
  await check('Q010: a cross-site mutation is refused', async () => {
    const r = await fetch(`${url}/_weft/fn/${ids.addTodo}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-weft': '1', origin: 'https://evil.example' }, body: JSON.stringify({ i: { title: 'x' } }) })
    eq(r.status, 403, 'status')
  })
  await check('Q002: invalid input is a 400 naming the field', async () => {
    const r = await post(a.context, 'addTodo', { title: '   ' })
    const e = (await r.json()).e
    eq([r.status(), e.code, e.issues[0].path], [400, 'Q002', ['title']], 'blank title')
  })
  await check('no page threw', () => eq([...a.errors, ...b.errors], [], 'page errors'))
  return { a, b, alice, bob, post, ids }
}

/** Function ids from the page's chunks: a stub is `query({ $id: "listTodos.abc123" })` in the client JS. */
async function functionIds(url, context) {
  const html = await (await context.request.get('/todos')).text()
  const out = {}
  const seen = new Set()
  const scan = async path => {
    if (seen.has(path)) return
    seen.add(path)
    const js = await (await context.request.get(path)).text()
    for (const m of js.matchAll(/\$id:\s*[`"']([A-Za-z_$][\w$]*)\.([0-9a-f]{6})[`"']/g)) out[m[1]] = `${m[1]}.${m[2]}`
    for (const m of js.matchAll(/["'`(]\.{0,2}\/?((?:assets\/)?[\w.-]+\.js)["'`)]/g)) await scan(`/assets/${m[1].replace(/^assets\//, '')}`).catch(() => {})
  }
  for (const m of html.matchAll(/(?:href|src)="(\/assets\/[^"]+\.js)"/g)) await scan(m[1])
  return out
}

export default async function run({ url, log }) {
  const t = suite({ url, log })
  const browser = await chromium.launch()
  try {
    await base(t, { url, browser })
  } finally {
    await browser.close()
  }
  return { checks: t.checks }
}
