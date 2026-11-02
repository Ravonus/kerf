// Page metadata (research 20 §7.1): the merge, the §2 tag set, escaping, the renderToString `head` option, and a
// page fetched as plain HTML (what a link-preview crawler sees: no JS runs) carrying every tag.
// weft-allow T005, T007: the output is head tags, not UI; the snapshot is research 20 §2's tag set, reviewed
import { createServer, get } from 'node:http'
import { headTags, key, mergeMeta, metaTags, renderToString, renderToStringAsync, ssr, type Site } from '@weft-js/core/ssr'
import { setHead } from '@weft-js/core/head'

const site: Site = {
  name: 'Acme',
  url: 'https://acme.dev',
  title: '%s · Acme',
  description: 'Tools for builders.',
  locale: 'en_US',
  image: { url: '/og/default.png', width: 1200, height: 630 },
  twitter: { card: 'summary_large_image', site: '@acme' },
}

const app = () => ssr(k => `<main${key(k)}>Pricing</main>`)

describe('metaTags', () => {
  it('writes the §2 tag set from the config alone', () => {
    expect(metaTags(mergeMeta(site), '/pricing?ref=x#top')).toMatchInlineSnapshot(`
      "<title data-wm>Acme</title>
      <meta name="description" content="Tools for builders." data-wm>
      <link rel="canonical" href="https://acme.dev/pricing" data-wm>
      <meta property="og:type" content="website" data-wm>
      <meta property="og:site_name" content="Acme" data-wm>
      <meta property="og:title" content="Acme" data-wm>
      <meta property="og:description" content="Tools for builders." data-wm>
      <meta property="og:url" content="https://acme.dev/pricing" data-wm>
      <meta property="og:locale" content="en_US" data-wm>
      <meta property="og:image" content="https://acme.dev/og/default.png" data-wm>
      <meta property="og:image:width" content="1200" data-wm>
      <meta property="og:image:height" content="630" data-wm>
      <meta name="twitter:card" content="summary_large_image" data-wm>
      <meta name="twitter:site" content="@acme" data-wm>"
    `)
  })

  it('escapes every value', () => {
    const html = metaTags(
      mergeMeta({ ...site, url: 'https://acme.dev/' }, { title: 'A <b> & "c"', description: '"><script>alert(1)</script>', extra: [{ name: 'x"y', content: '<' }] }),
      '/a"b',
    )
    expect(html).toContain('<title data-wm>A &lt;b> &amp; &quot;c&quot; · Acme</title>')
    expect(html).toContain('content="&quot;>&lt;script>alert(1)&lt;/script>"')
    expect(html).toContain('href="https://acme.dev/a&quot;b"')
    expect(html).toContain('<meta name="x&quot;y" content="&lt;" data-wm>')
    expect(html).not.toMatch(/<script|<b>/)
  })

  it('omits canonical and og:url without site.url, and writes no image for auto (not built yet)', () => {
    const tags = headTags(mergeMeta({ name: 'Acme', image: 'auto' }), '/x').map(t => t[1].name ?? t[1].property ?? t[1].rel ?? t[0])
    expect(tags).toEqual(['title', 'og:type', 'og:site_name', 'og:title', 'twitter:card'])
  })
})

describe('mergeMeta', () => {
  it('config → layouts → route: later wins, og and twitter merge by key', () => {
    const m = mergeMeta(
      site,
      { title: 'Docs', og: { type: 'article', title: 'Docs (og)' }, twitter: { creator: '@ada' } },
      null,
      { title: 'Install', description: 'How to install.', og: { title: undefined, image: 'https://cdn.acme.dev/i.png' }, twitter: { site: '@acmedocs' } },
    )
    expect(m).toMatchObject({
      title: 'Install · Acme',
      description: 'How to install.',
      og: { type: 'article', title: 'Docs (og)', siteName: 'Acme', image: 'https://cdn.acme.dev/i.png' },
      twitter: { card: 'summary_large_image', site: '@acmedocs', creator: '@ada' },
    })
  })

  it('title: { absolute } skips the template; no title is the site name', () => {
    expect(mergeMeta(site, { title: 'Docs' }, { title: { absolute: 'Home' } }).title).toBe('Home')
    expect(mergeMeta(site, { description: 'x' }).title).toBe('Acme')
    expect(mergeMeta({ title: '%s · Acme' }, { title: 'A' }).title).toBe('A · Acme')
  })

  it('twitter:* falls back to og:*: only what differs is written', () => {
    const tags = metaTags(mergeMeta(site, { twitter: { title: 'Short', description: 'Tools for builders.' } }), '/')
    expect(tags).toContain('<meta name="twitter:title" content="Short" data-wm>')
    expect(tags).not.toContain('twitter:description')
  })
})

describe('renderToString head option', () => {
  it('wraps an app without <head> in a document with the tags first', () => {
    const html = renderToString(app, { hydratable: false, head: { site, path: '/pricing' } })
    expect(html).toMatch(/^<!doctype html>\n<html lang="en-US">\n<head>\n<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n<title data-wm>Acme<\/title>/)
    expect(html).toMatch(/<\/head>\n<body><main>Pricing<\/main><\/body>\n<\/html>$/)
  })

  it("puts the tags at the top of the app's own <head> (after its charset)", async () => {
    const doc = () => ssr(() => '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/a.css"></head><body>x</body></html>')
    const html = await renderToStringAsync(doc, { hydratable: false, head: { site, meta: [{ title: 'Pricing' }], path: '/pricing' } })
    expect(html).toMatch(/^<html><head><meta charset="utf-8">\n<title data-wm>Pricing · Acme<\/title>\n[\s\S]*data-wm>\n<link rel="stylesheet"/)
  })

  it('is plain HTML a crawler reads: every tag in the first response, before </head>, no JS run', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(renderToString(app, { head: { site, meta: { title: 'Pricing', description: 'Plans & prices.' }, path: req.url! } }))
    })
    await new Promise<void>(r => { server.listen(0, '127.0.0.1', r) })
    const { port } = server.address() as { port: number }
    const body = await new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${port}/pricing?utm=x`, { headers: { 'user-agent': 'Twitterbot/1.0' } }, res => {
        let s = ''
        res.setEncoding('utf8').on('data', c => (s += c)).on('end', () => resolve(s))
      }).on('error', reject)
    })
    server.close()
    const head = body.slice(0, body.indexOf('</head>'))
    const expected = [
      '<title data-wm>Pricing · Acme</title>',
      '<meta name="description" content="Plans &amp; prices." data-wm>',
      '<link rel="canonical" href="https://acme.dev/pricing" data-wm>',
      '<meta property="og:type" content="website" data-wm>',
      '<meta property="og:site_name" content="Acme" data-wm>',
      '<meta property="og:title" content="Pricing · Acme" data-wm>',
      '<meta property="og:description" content="Plans &amp; prices." data-wm>',
      '<meta property="og:url" content="https://acme.dev/pricing" data-wm>',
      '<meta property="og:locale" content="en_US" data-wm>',
      '<meta property="og:image" content="https://acme.dev/og/default.png" data-wm>',
      '<meta property="og:image:width" content="1200" data-wm>',
      '<meta property="og:image:height" content="630" data-wm>',
      '<meta name="twitter:card" content="summary_large_image" data-wm>',
      '<meta name="twitter:site" content="@acme" data-wm>',
    ]
    for (const tag of expected) expect(head).toContain(tag)
    expect(head.match(/data-wm/g)).toHaveLength(expected.length)
    expect(head).not.toContain('<script')
  })
})

describe('setHead (client navigation)', () => {
  it('swaps the [data-wm] tags and document.title, leaving other head content', () => {
    document.head.innerHTML = '<meta charset="utf-8">' + metaTags(mergeMeta(site), '/') + '<link rel="stylesheet" href="/a.css">'
    setHead(mergeMeta(site, { title: 'Docs', description: 'Read me.' }), '/docs')
    expect(document.title).toBe('Docs · Acme')
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
    expect(document.head.querySelector('link[rel=canonical]')!.getAttribute('href')).toBe('https://acme.dev/docs')
    expect(document.head.querySelectorAll('meta[name=description]')).toHaveLength(1)
    expect(document.head.querySelector('meta[name=description]')!.getAttribute('content')).toBe('Read me.')
    expect(document.head.lastElementChild!.getAttribute('href')).toBe('/a.css')
    expect(document.head.querySelectorAll('[data-wm]')).toHaveLength(14)
    document.head.innerHTML = ''
  })
})
