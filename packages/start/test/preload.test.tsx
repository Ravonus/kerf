// A page's chunks are preloaded with its HTML, so they don't wait for the entry to import them.
import { createHandler, type Manifest } from '../src/server'

const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [],
  routes: [{ id: '/', file: 'home', layouts: [], pattern: '/', params: [], kind: 'page' }],
}
const page = (chunks: Record<string, { js: { href: string }[] }>) =>
  createHandler({
    manifest,
    modules: { home: { default: () => <h1>Lemon</h1> } },
    chunks,
    assets: { entry: '/entry.js' },
  })(new Request('http://localhost/')).then((r) => r.text())

test('the route on the page has its chunks preloaded once, and the entry not at all', async () => {
  const html = await page({
    '/': {
      js: [
        { href: '/home.js' },
        { href: '/shared.js' },
        { href: '/shared.js' },
        { href: '/entry.js' },
      ],
    },
  })
  expect(html.match(/rel="modulepreload" href="[^"]+"/g)).toEqual([
    'rel="modulepreload" href="/home.js"',
    'rel="modulepreload" href="/shared.js"',
  ])
})

test('a route that is not on the page preloads nothing', async () => {
  expect(await page({ '/other': { js: [{ href: '/other.js' }] } })).not.toContain('modulepreload')
})

// A lazy island in the page's first view stays preloaded, one past it doesn't, and neither does for who asked for less.
const mark = (id: string) =>
  `<!--wi:["${id}","${id}",[],"i"]--><!--[--><button wk="${id}/0">x</button><!--]-->`
const lazy = (
  body: string,
  chunks: Record<string, { js: { href: string }[] }>,
  options: object = { lazy: true },
  headers?: HeadersInit,
) =>
  createHandler({
    manifest,
    modules: { home: { default: () => ({ t: body }) } },
    statics: ['/'],
    chunks,
    assets: { entry: '/entry.js' },
    ...options,
  })(new Request('http://localhost/', { headers: headers ?? {} }))
const CHUNKS = {
  $client: { js: [{ href: '/run.js' }] },
  top: { js: [{ href: '/top.js' }] },
  low: { js: [{ href: '/low.js' }] },
}
const PAGE = `<h1>Hi</h1>${mark('top')}${'<section><p>Lots of text in a long page</p></section>'.repeat(30)}${mark('low')}`
const preloads = (html: string) =>
  html.match(/modulepreload" href="[^"]+/g)?.map((s) => s.slice(21)) ?? []

test('the first view stays preloaded, what is below it is not', async () => {
  const html = await (await lazy(PAGE, CHUNKS)).text()
  expect(preloads(html)).toEqual(['/run.js', '/top.js'])
  expect(html).toContain('__wq')
  expect(html).toMatch(/\}\)\(0\)<\/script>/) // nothing has to run yet
})

test('less data: nothing lazy is preloaded, and the page says it varies', async () => {
  const res = await lazy(PAGE, CHUNKS, { lazy: true }, { 'save-data': 'on' })
  expect(preloads(await res.text())).toEqual([])
  expect((await lazy(PAGE, CHUNKS)).headers.get('vary')).toMatch(/Save-Data/)
})

test('an island that loads with the page is preloaded wherever it is, and the page starts at once', async () => {
  const eager = `${'<section><p>Lots of text in a long page</p></section>'.repeat(30)}<!--wi:["low","k",[]]--><!--[--><b></b><!--]-->`
  const html = await (await lazy(eager, CHUNKS)).text()
  expect(preloads(html)).toEqual(['/run.js', '/low.js'])
  expect(html).toMatch(/\}\)\(1\)<\/script>/)
})

test('no capture script without lazy islands in the app', async () => {
  expect(await (await lazy(PAGE, CHUNKS, {})).text()).not.toContain('__wq')
})

test('every island on the page, in view or not, has its stylesheet in the head', async () => {
  const chunks = {
    top: { js: [], css: [{ href: '/top.css' }] },
    low: { js: [], css: [{ href: '/low.css' }, { href: '/top.css' }] },
  }
  const html = await (await lazy(PAGE, chunks)).text()
  expect(html.match(/stylesheet" href="[^"]+/g)?.map((s) => s.slice(18))).toEqual([
    '/top.css',
    '/low.css',
  ])
})
