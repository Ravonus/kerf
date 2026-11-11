import { inject } from 'vitest'
import { pathPages } from '../src/derive.mjs'
// The fixture app under `kerf dev` (Vite + kerfStart + Nitro), fetched the way a link-preview crawler fetches it:
// one GET, no JavaScript (research 20 §1). Routing, metadata, status codes, streaming order, the navigation data
// endpoint and share cards.
const url = inject('url')
const get = (path: string, init?: RequestInit) => fetch(url + path, { redirect: 'manual', ...init })
const html = async (path: string) => {
  const res = await get(path)
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() }
}
/** The `data-wm` tags in <head>, in order, as `tag attr=value…` lines. */
const tags = (text: string) =>
  [
    ...text
      .slice(0, text.indexOf('</head>'))
      .matchAll(/<(title|meta|link)\b([^>]*?)\sdata-wm>(?:([^<]*)<\/title>)?/g),
  ].map(([, tag, attrs, body]) =>
    [
      tag,
      ...[...attrs!.matchAll(/(\w[\w:-]*)="([^"]*)"/g)].map(([, k, v]) => `${k}=${v}`),
      ...(body !== undefined ? [body] : []),
    ].join(' '),
  )

describe('a crawler fetching a param route sees every tag in the first response', () => {
  test('/users/42', async () => {
    const r = await html('/users/42')
    expect(r.status).toBe(200)
    expect(r.type).toBe('text/html; charset=utf-8')
    const t = tags(r.text)
    const image = t.find((x) => x.startsWith('meta property=og:image content='))
    expect(image).toMatch(
      /^meta property=og:image content=https:\/\/acme\.dev\/_kerf\/og\/users\/42\.png\?v=[a-z0-9]+$/,
    )
    expect(t).toEqual([
      'title Alan Turing · Acme',
      'meta name=description content=Computable numbers.',
      'link rel=canonical href=https://acme.dev/users/42',
      'meta property=og:type content=profile',
      'meta property=og:site_name content=Acme',
      'meta property=og:title content=Alan Turing · Acme',
      'meta property=og:description content=Computable numbers.',
      'meta property=og:url content=https://acme.dev/users/42',
      'meta property=og:locale content=en_US',
      image,
      'meta property=og:image:width content=1200',
      'meta property=og:image:height content=630',
      'meta property=og:image:alt content=Alan Turing · Acme',
      'meta name=twitter:card content=summary_large_image',
      'meta name=twitter:site content=@acme',
      'meta name=theme-color content=#0b0b0f',
    ])
    // Escaped values, and the body is server-rendered too.
    const ada = await html('/users/1')
    expect(ada.text).toContain(
      '<meta name="description" content="First programmer &amp; &quot;analyst&quot; &lt;of engines>." data-wm>',
    )
    expect(r.text).toMatch(/<h2>Alan Turing<\/h2>/)
  })

  test('the card hash follows the data: another user, another ?v=', async () => {
    const v = async (p: string) => /og\/[^?]+\?v=([a-z0-9]+)/.exec((await html(p)).text)![1]
    expect(await v('/users/1')).not.toBe(await v('/users/2'))
    expect(await v('/users/1')).toBe(await v('/users/1'))
  })
})

describe('routing', () => {
  test('params and nested layouts render on the server', async () => {
    const { text } = await html('/users/2')
    expect(text).toMatch(
      /<div class="root"><nav>.*<section wk="[^"]+" class="users"><ul>.*<div class="detail"><!--wl:2:[^>]*--><article><h2>Grace Hopper<\/h2>/s,
    )
    expect(text).toMatch(/<a wk="[^"]+" href="\/users\/2" aria-current="page">Grace Hopper<\/a>/)
  })

  test('a layout index route', async () => {
    const r = await html('/users')
    expect(r.status).toBe(200)
    expect(tags(r.text)[0]).toBe('title Users · Acme')
    expect(r.text).toContain('<p')
    expect(r.text).toContain('Pick a user.')
  })

  test('no matching route: the 404 route, in the root layout, with status 404 and its own tags', async () => {
    const r = await html('/nowhere/at/all')
    expect(r.status).toBe(404)
    expect(tags(r.text).slice(0, 2)).toEqual([
      'title Page not found · Acme',
      'meta name=description content=There is nothing here.',
    ])
    expect(r.text).not.toContain('og:image') // no card for a page that isn't there
    expect(r.text).toMatch(/<nav>.*<h1[^>]*class="not-found">Lost\? \/nowhere\/at\/all<\/h1>/s)
  })

  test("`load` returning notFound(): 404, and the route's meta never runs", async () => {
    const r = await html('/users/999')
    expect(r.status).toBe(404)
    expect(tags(r.text)[0]).toBe('title Page not found · Acme')
  })

  test('a loader that throws: the error route with status 500', async () => {
    const r = await html('/boom')
    expect(r.status).toBe(500)
    expect(tags(r.text)[0]).toBe('title Something broke · Acme')
    expect(r.text).toMatch(/class="error">Error 500: loader exploded/)
  })

  test('H007: meta reading a deferred field is an error, not a page with a missing title', async () => {
    const r = await html('/deferred-meta')
    expect(r.status).toBe(500)
    expect(r.text).toContain('H007')
  })
})

describe('streaming', () => {
  test('head and shell first, then each Boundary as it resolves, then the page data', async () => {
    const token = crypto.randomUUID()
    const path = `/slow?sync=${token}`
    const res = await get(path)
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let all = ''
    const readUntil = async (marker: string) => {
      while (!all.includes(marker)) {
        const part = await reader.read()
        if (part.done) throw new Error(`Stream ended before ${marker}`)
        all += dec.decode(part.value, { stream: true })
      }
    }
    const release = async (name: string) => {
      const control = await get(`${path}&release=${name}`)
      await control.text()
    }
    try {
      await readUntil('Loading stock')
      await readUntil('id="kerf-route"')
      expect(all).toContain('<title data-wm>Slow page · Acme</title>')
      expect(all).toContain('</head>')
      expect(all).toContain('Loading reviews')
      expect(all).toContain('id="kerf-route"')
      expect(all).not.toContain('In stock')
      await release('stock')
      await readUntil('In stock: <!--[-->7')
      expect(all).not.toContain('<li wk')
      await release('reviews')
      await readUntil('<li wk')
      for (let part; !(part = await reader.read()).done;)
        all += dec.decode(part.value, { stream: true })
    } finally {
      await release('stock')
      await release('reviews')
      await reader.cancel()
    }
    const stock = all.indexOf('In stock: <!--[-->7')
    const reviews = all.indexOf('<li wk')
    expect(stock).toBeGreaterThan(all.indexOf('Loading stock'))
    expect(reviews).toBeGreaterThan(stock)
    expect(all.lastIndexOf('id="kerf-data"')).toBeGreaterThan(reviews)
    expect(all.match(/\$wb=function/g)).toHaveLength(1)
    // The resolved values travel in the page data, so the client never refetches them.
    const data = JSON.parse([...all.matchAll(/id="kerf-data">(.*?)<\/script>/g)].at(-1)![1]!)
    expect(Object.values(data.r as Record<string, { v: unknown }>).map((x) => x.v)).toEqual(
      expect.arrayContaining([7, ['Great', 'Fine']]),
    )
    expect(Object.values(data.b)).toEqual(['c', 'c'])
  })
})

describe('the navigation endpoint', () => {
  test('/_kerf/data/<path>: matches, params, data and the merged head, as JSON', async () => {
    const res = await get('/_kerf/data/users/1')
    const body = await res.json()
    expect(body.m.map((m: { id: string }) => m.id)).toEqual([
      'layout:',
      'layout:users',
      '/users/$id',
    ])
    expect(body.m[1]).toMatchObject({ data: { users: expect.any(Array) } })
    expect(body.m[2]).toMatchObject({
      params: { id: '1' },
      s: 1,
      h: expect.stringContaining('Ada Lovelace'),
    }) // static: its HTML, not its data
    expect(body.m[2].data).toBeUndefined()
    expect(body.h.title).toBe('Ada Lovelace · Acme')
    expect(body.s).toBe(200)
  })

  test('deferred fields arrive resolved, named in `d`', async () => {
    const body = await (await get('/_kerf/data/slow')).json()
    expect(body.m[1]).toMatchObject({
      data: { title: 'Slow page', reviews: ['Great', 'Fine'], stock: 7 },
      d: ['reviews', 'stock'],
    })
  })

  test('a missing page: the 404 route as data', async () => {
    const body = await (await get('/_kerf/data/users/999')).json()
    expect(body.s).toBe(404)
    expect(body.m.map((m: { id: string }) => m.id)).toEqual(['layout:', '404'])
  })
})

describe('share cards', () => {
  test("a param route's card is a 1200×630 PNG, rendered on demand", async () => {
    const page = await html('/users/42')
    const src = /og:image" content="https:\/\/acme\.dev([^"]+)"/.exec(page.text)![1]!
    const res = await get(src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('no-store') // dev: edits show on reload
    const png = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(png.slice(1, 4), (c) => String.fromCharCode(c)).join('')).toBe('PNG')
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  })

  test("only params the route's load accepts: anything else is a 404, not a card", async () => {
    expect((await get('/_kerf/og/users/999.png')).status).toBe(404)
    expect((await get('/_kerf/og/nowhere.png')).status).toBe(404)
  })

  test('a route without its own card gets the default one', async () => {
    const res = await get('/_kerf/og/about.png')
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  test('build mode: the server lists the cards to prerender (static routes and `prerender` params)', async () => {
    expect((await get('/_kerf/og-routes')).status).toBe(404) // only Nitro's prerender gets the list
    const res = await get('/_kerf/og-routes', {
      headers: { 'x-nitro-prerender': '/_kerf/og-routes' },
    })
    const list = res.headers.get('x-nitro-prerender')!.split(',')
    expect(list).toContain('/_kerf/og/index.png')
    expect(list).toContain('/_kerf/og/about.png')
    expect(list).toContain('/_kerf/og/users/1.png') // prerender: [{ id: '1' }]
    expect(list).not.toContain('/_kerf/og/users/2.png')
    expect(list.some((p) => p.includes('boom') || p.includes('deferred'))).toBe(false)
  })
})

describe('fonts', () => {
  test('a bound font.build puts its preloads in <head> before the stylesheets, and serves the face', async () => {
    const { text } = await html('/')
    const head = text.slice(0, text.indexOf('</head>'))
    const link =
      /<link rel="preload" as="font" type="font\/woff2" href="([^"]+)" crossorigin>/.exec(head)
    expect(link?.[1]).toBe('/@kerf-assets/acme-400-latin-0123abcd.woff2')
    const css = head.indexOf('rel="stylesheet"')
    if (css >= 0) expect(link!.index).toBeLessThan(css)
    const res = await get(link![1]!)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('wOF2 fixture')
  })
})

test('the prerender list fits in a header, however big the site', () => {
  const paths = Array.from({ length: 2000 }, (_, i) => `/_kerf/og/docs/some-page-${i}.png`)
  const pages = pathPages(paths)
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.flat()).toEqual(paths)
  for (const p of pages) expect(p.join(',').length).toBeLessThan(6100)
  expect(pathPages([])).toEqual([[]])
})
