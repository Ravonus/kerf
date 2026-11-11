import { JSDOM } from 'jsdom'
import { inject } from 'vitest'
// The automatic layer, read the way a crawler reads it: one GET, no JavaScript, and a real HTML parser (research 20 §10).
const url = inject('url')

function head(text: string) {
  const { document } = new JSDOM(text).window
  const el = document.head
  const meta: Record<string, string> = {}
  for (const n of el.querySelectorAll('meta[data-wm]'))
    meta[(n.getAttribute('property') ?? n.getAttribute('name'))!] = n.getAttribute('content')!
  return {
    title: el.querySelector('title')!.textContent,
    canonical: el.querySelector('link[rel=canonical]')?.getAttribute('href'),
    meta,
    scripts: [...el.querySelectorAll('script')].map((n) => ({
      type: n.getAttribute('type'),
      src: n.getAttribute('src'),
      text: n.textContent,
    })),
    extra: [...el.querySelectorAll('img')], // what an injection would make
    bodyImages: [...document.body.querySelectorAll('img')],
  }
}
const page = async (path: string) => {
  const res = await fetch(url + path)
  return { res, text: await res.text() }
}

describe('a page with no meta', () => {
  test('its h1 and first real paragraph, cut at a sentence, escaped, with a card', async () => {
    const { text } = await page('/meta/plain')
    const h = head(text)
    expect(h.title).toBe('Harvest & storage notes · Acme')
    const d = h.meta.description
    expect(d).toBe(
      'Harvest when 5 < 7 and the "tonnes" & crates are in: every mark here is escaped wherever it lands.',
    )
    expect(text).toContain('content="Harvest when 5 &lt; 7 and the &quot;tonnes&quot; &amp; crates')
    expect(h.meta['og:title']).toBe('Harvest & storage notes · Acme')
    expect(h.meta['og:image']).toMatch(
      /^https:\/\/acme\.dev\/_kerf\/og\/meta\/plain\.png\?v=[a-z0-9]+$/,
    )
    expect(h.meta['og:image:alt']).toBe('Harvest & storage notes · Acme')
    expect(h.meta['twitter:card']).toBe('summary_large_image')
    expect(h.meta['og:url']).toBe('https://acme.dev/meta/plain')
    expect(h.canonical).toBe('https://acme.dev/meta/plain')
  })
  test('its card is a PNG, and shares the page`s URL', async () => {
    const { text } = await page('/meta/plain')
    const image = head(text).meta['og:image']!.replace('https://acme.dev', url)
    const res = await fetch(image)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await res.arrayBuffer()).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47])
  })
  test('the navigation payload carries the same finished head', async () => {
    const { text } = await page('/meta/plain')
    const nav = await (await fetch(`${url}/_kerf/data/meta/plain`)).json()
    const h = head(text)
    expect(nav.h.title).toBe(h.title)
    expect(nav.h.description).toBe(h.meta.description)
    expect(nav.h.og.image.url).toBe(h.meta['og:image']!.replace('https://acme.dev', ''))
    expect(nav.h.jsonLd).toBeUndefined()
  })
})

test('explicit meta always wins: nothing derived overrides it', async () => {
  const h = head((await page('/users/42')).text)
  expect(h.title).toBe('Alan Turing · Acme')
  expect(h.meta.description).toBe('Computable numbers.')
})

describe('hostile data in meta', () => {
  const name = encodeURIComponent('<b>"x"</b>')
  test('stays text in every tag, and in structured data', async () => {
    const { text } = await page(`/meta/${name}`)
    const h = head(text)
    expect(h.title).toBe('</title><script>alert("<b>"x"</b>")</script> · Acme')
    expect(h.meta.description).toBe('"><img src=x onerror=alert(1)> <b>"x"</b> & co')
    expect(h.extra).toEqual([])
    expect(h.bodyImages).toEqual([])
    // Only kerf's own scripts: nothing the data opened. The JSON-LD parses, and holds the text.
    expect(h.scripts.filter((s) => s.text.includes('alert('))).toHaveLength(1)
    const ld = h.scripts.find((s) => s.type === 'application/ld+json')
    expect(JSON.parse(ld!.text).name).toContain('</script><script>alert(2)</script>')
    expect(ld!.text).not.toContain('<')
    expect(h.meta['og:title']).toBe(h.title)
  })
})

test('a deferred field stays out of a page`s tags, and reading one is H007', async () => {
  const res = await fetch(`${url}/deferred-meta`)
  expect(res.status).toBe(500)
})

describe('structured data only where kerf is sure', () => {
  test('the home page is a WebSite', async () => {
    const h = head((await page('/')).text)
    const ld = JSON.parse(h.scripts.find((s) => s.type === 'application/ld+json')!.text)
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Acme',
      url: 'https://acme.dev',
      description: 'Tools for builders.',
    })
  })
  test('no other page gets any', async () => {
    expect(
      head((await page('/about')).text).scripts.some((s) => s.type === 'application/ld+json'),
    ).toBe(false)
  })
})

describe('cards are safe to cache', () => {
  test('two requests: the same URL, the same bytes, even when the loader differs', async () => {
    const a = head((await page('/meta/changing')).text).meta['og:image']
    const b = head((await page('/meta/changing')).text).meta['og:image']
    expect(a).toBe(b)
    const bytes = async (u: string) =>
      Buffer.from(await (await fetch(u.replace('https://acme.dev', url))).arrayBuffer()).toString(
        'base64',
      )
    expect(await bytes(a!)).toBe(await bytes(b!))
  })
  test('different text is a different URL', async () => {
    const a = head((await page('/users/42')).text).meta['og:image']
    const b = head((await page('/users/1')).text).meta['og:image']
    expect(a!.replace(/.*\?v=/, '')).not.toBe(b!.replace(/.*\?v=/, ''))
  })
  test('a card for a page that does not exist is a 404, whatever the path says', async () => {
    expect((await fetch(`${url}/_kerf/og/users/${encodeURIComponent('nobody')}.png`)).status).toBe(
      404,
    )
  })
})
