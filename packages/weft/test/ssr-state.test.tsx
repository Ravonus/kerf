// The defineState payload and `cookie` persist across a server render and hydration (research 29 §2–3): what a server
// sees, 0 key misses and 0 DOM writes on the client, the late write for local storage, S002, S010 and S013.
// weft-allow T005: framework test of SSR and hydration; server markup and node identity are the subject
import { renderToStream, renderToString } from 'weft/ssr'
import { hydrate, render } from 'weft/dom'
import { flush } from 'weft/test'
import { rt } from '../src/index'
import { hydration } from '../src/hydrate'
import { useApp, createApp } from '../src/scope'
// @ts-expect-error: query imports (vite.mjs)
import { Note as ServerNote, Prefs as ServerPrefs } from './fixtures/ssr/Prefs.tsx?weft-ssr'
// @ts-expect-error
import { Note as ClientNote, Prefs as ClientPrefs } from './fixtures/ssr/Prefs.tsx?weft-hydrate'
import { odd, prefs } from './fixtures/ssr/Prefs.state'

const envelope = (data: unknown, v = 1) => encodeURIComponent(JSON.stringify({ v, at: 0, data }))
const jar = (c: Record<string, string>) => ({ get: (n: string) => c[n] })
const payload = (html: string) => JSON.parse(/data-weft>(.*)<\/script>/.exec(html)?.[1] ?? 'null')

function clearCookies() {
  for (const c of document.cookie.split('; ')) if (c) document.cookie = `${c.split('=')[0]}=; Path=/; Max-Age=0`
}

let prevApp: ReturnType<typeof useApp>
beforeEach(() => { prevApp = useApp(createApp()) })
afterEach(() => {
  useApp(prevApp)
  document.body.innerHTML = ''
  localStorage.clear()
  clearCookies()
  vi.restoreAllMocks()
})

function hydrateInto(html: string, client: () => unknown) {
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const writes: MutationRecord[] = []
  const mo = new MutationObserver(r => writes.push(...r))
  mo.observe(container, { subtree: true, childList: true, characterData: true, attributes: true })
  const dispose = hydrate(client, container)
  writes.push(...mo.takeRecords())
  return { container, writes, mo, dispose }
}

test('a cookie box renders its value on the server and hydrates 0/0', () => {
  const cookies = jar({ 'weft.app.prefs.theme': envelope('dark'), 'weft.app.prefs.cart': envelope({ n: 3 }, 2) })
  const html = renderToString(() => ServerPrefs({}), { app: { cookies } })
  expect(html).toContain('data-theme="dark"')
  expect(html).toContain('<b>3</b>')
  expect(payload(html).s).toEqual({ prefs: { theme: 'dark', cart: { n: 3 } } })

  document.cookie = `weft.app.prefs.theme=${envelope('dark')}; Path=/`
  document.cookie = `weft.app.prefs.cart=${envelope({ n: 3 }, 2)}; Path=/`
  const { container, writes } = hydrateInto(html, () => ClientPrefs({}))
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  expect(container.querySelector('p')!.getAttribute('data-theme')).toBe('dark')
})

test('the payload wins over a cookie that changed since the page was rendered', () => {
  const html = renderToString(() => ServerPrefs({}), { app: { cookies: jar({ 'weft.app.prefs.theme': envelope('dark') }) } })
  document.cookie = `weft.app.prefs.theme=${envelope('sepia')}; Path=/`
  const { writes } = hydrateInto(html, () => ClientPrefs({}))
  expect(writes).toEqual([])
})

test('a box a render wrote travels in the payload, and nothing goes when nothing differs', () => {
  const html = renderToString(() => ServerPrefs({ label: 'from load' }), { app: { cookies: jar({}) } })
  expect(payload(html).s).toEqual({ prefs: { label: 'from load' } })
  const { writes } = hydrateInto(html, () => ClientPrefs({}))
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  expect(renderToString(() => ServerPrefs({}), { app: { cookies: jar({}) } })).not.toContain('data-weft>')
})

test('each scope takes its payload once: a later app starts clean', () => {
  const html = renderToString(() => ServerPrefs({ label: 'first' }), { app: { cookies: jar({}) } })
  hydrateInto(html, () => ClientPrefs({}))
  useApp(createApp())
  expect(prefs.label.value).toBe('init')
})

test('the streamed page data carries the state of the last pass', async () => {
  const s = renderToStream(() => ServerPrefs({ label: 'streamed' }), { app: { cookies: jar({ 'weft.app.prefs.theme': envelope('dark') }) } })
  for await (const _ of s.chunks);
  expect(s.data()?.s).toEqual({ prefs: { theme: 'dark', label: 'streamed' } })
})

test('a cookie the schema rejects, or that is not even JSON, renders `init`', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const bad = renderToString(() => ServerPrefs({}), { app: { cookies: jar({ 'weft.app.prefs.cart': envelope({ n: 'x' }, 2), 'weft.app.prefs.theme': '%7Bnope' }) } })
  expect(bad).toContain('<b>0</b>')
  expect(bad).toContain('data-theme="light"')
  expect(err.mock.calls.map(c => String(c[0]).slice(0, 4))).toEqual(['S003', 'S003'])
})

test('an old cookie is migrated on the server', () => {
  const html = renderToString(() => ServerPrefs({}), { app: { cookies: jar({ 'weft.app.prefs.cart': envelope(7, 1) }) } })
  expect(html).toContain('<b>7</b>')
})

test('a client write reaches the cookie, encoded, and the next server render sees it', async () => {
  prefs.setTheme('dark; Path=/x')
  await flush()
  const raw = document.cookie.split('; ').find(c => c.startsWith('weft.app.prefs.theme='))!
  expect(raw).toMatch(/%3B%20Path%3D/)
  const html = renderToString(() => ServerPrefs({}), { app: { cookies: jar({ 'weft.app.prefs.theme': raw.split('=')[1] }) } })
  expect(html).toContain('data-theme="dark; Path=/x"')
})

test('S008: cookies over the 3 KB budget', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  prefs.setTheme('x'.repeat(3200))
  await flush()
  expect(err.mock.calls.some(c => /^S008.*3 KB/.test(String(c[0])))).toBe(true)
})

test('a local box stays at init through hydration, then takes the stored value', async () => {
  localStorage.setItem('weft:app:prefs.note', JSON.stringify({ v: 1, at: 0, data: 'saved' }))
  vi.spyOn(console, 'error').mockImplementation(() => {}) // S013, tested below
  const html = renderToString(() => ServerNote())
  const { container, writes, mo } = hydrateInto(html, () => ClientNote())
  expect(hydration.misses).toBe(0)
  expect(container.textContent).toBe('') // the first client render equals the server's
  await flush()
  mo.disconnect()
  expect(container.textContent).toBe('saved')
  expect(writes.length).toBeLessThanOrEqual(1)
  expect(JSON.parse(localStorage.getItem('weft:app:prefs.note')!).at).toBe(0) // the late write didn't rewrite storage
})

test('outside hydration a local box reads storage at once', () => {
  localStorage.setItem('weft:app:prefs.note', JSON.stringify({ v: 1, at: 0, data: 'saved' }))
  const el = document.body.appendChild(document.createElement('div'))
  render(() => <p>{prefs.note.value}</p>, el)
  expect(el.textContent).toBe('saved')
})

test('S013: a local box read in a server render', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  renderToString(() => ServerNote())
  expect(err.mock.calls.map(c => String(c[0]))).toEqual([expect.stringMatching(/^S013: `prefs\.note` persists to 'local'/)])
})

test('S010: a value JSON would change stays out of the payload', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const html = renderToString(() => { odd.when.value = new Date(0); return null })
  expect(html).not.toContain('data-weft>')
  expect(err.mock.calls.map(c => String(c[0]).slice(0, 4))).toEqual(['S010'])
})

describe('S002', () => {
  beforeEach(() => { useApp(prevApp); rt.isolated = true })
  afterEach(() => { rt.isolated = false })

  test('a handle reached outside a render throws, on a server process', () => {
    expect(() => prefs.theme).toThrow(/^S002/)
    expect(prefs.$name).toBe('prefs') // the name needs no instance
  })

  test('inside a render it resolves to that render\'s own app, and requests do not share it', () => {
    const one = renderToString(() => ServerPrefs({ label: 'a' }), { app: { cookies: jar({}) } })
    const two = renderToString(() => ServerPrefs({}), { app: { cookies: jar({}) } })
    expect(one).toContain('<i>a</i>')
    expect(two).toContain('<i>init</i>')
  })
})
