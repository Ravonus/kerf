// The built-in share card (research 20 §10): real PNGs through the real renderer, in both schemes and at the sizes a
// page can throw at it. `CARD_OUT=<dir>` keeps them, to look at.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { renderToString } from 'weft/ssr'
import { DefaultCard } from '../src/og/DefaultCard'
import { renderCard } from '../src/og/index.mjs'
import { cardTitleSize } from '../src/derive.mjs'

const require = createRequire(import.meta.url)
const inter = (w: number) => ({ name: 'Inter', weight: w, style: 'normal' as const, data: readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff2`)) })
const fonts = [inter(400), inter(700)]
const site = { name: 'Lemonstand', url: 'https://lemonstand.example', title: '%s · Lemonstand' }
const LONG = 'Entrepreneurship for young people, with an AI coach who has read every page and asks what you would do next, then what you would do after that, and keeps on going past where any card can show it.'
const cases = {
  short: { title: 'Pricing · Lemonstand', description: 'Three plans, billed monthly.', path: '/pricing' },
  long: { title: 'A title that goes on and on about what the page holds, far longer than any title should, until it just has to stop · Lemonstand', description: LONG, path: '/guides/a/very/long/path' },
  word: { title: 'Supercalifragilisticexpialidocious-and-a-half-again-unbroken-word-that-will-not-wrap · Lemonstand', description: '', path: '/w' },
  escaped: { title: '<b>Tags</b> & "quotes"', description: '</div><img src=x> stays text.', path: '/' },
}
const out = process.env.CARD_OUT

async function draw(name: string, props: any) {
  const found: any[] = []
  const html = renderToString(() => <DefaultCard {...props} />, { hydratable: false })
  const png = await renderCard(html, undefined, fonts, { onDiagnostic: (d: any) => found.push(d) })
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, `${name}.png`), png) }
  return { png, html, found }
}

describe.each(['dark', 'light'] as const)('%s', scheme => {
  test.each(Object.keys(cases))('%s: a 1200×630 PNG, nothing the renderer refused', async name => {
    const { png, found } = await draw(`${scheme}-${name}`, { ...cases[name as keyof typeof cases], site: { ...site, card: { scheme } } })
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47])
    expect(found).toEqual([])
    const view = new DataView(png.buffer, png.byteOffset)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  })
})

test('the same input draws the same bytes', async () => {
  const a = await draw('same-a', { ...cases.short, site })
  const b = await draw('same-b', { ...cases.short, site })
  expect(Buffer.compare(a.png, b.png)).toBe(0)
})

test('the template is off the title: the card shows the name on its own', async () => {
  const { html } = await draw('name', { ...cases.short, site })
  expect(html).toContain('>Pricing<')
  expect(html).not.toContain('Pricing · Lemonstand')
})

test('text is text in the card too', async () => {
  const { html } = await draw('text', { ...cases.escaped, site })
  expect(html).toContain('&lt;img src=x>')
  expect(html).not.toContain('<img')
})

test('a site`s own colours win over the scheme`s', async () => {
  const { html } = await draw('accent', { ...cases.short, site: { ...site, card: { accent: '#ff3300', dark: { background: '#000011' } } } })
  expect(html).toContain('#ff3300')
  expect(html).toContain('#000011')
})

test('shorter titles get bigger type', () => {
  expect(cardTitleSize('Lists')).toBeGreaterThan(cardTitleSize('a'.repeat(40)))
  expect(cardTitleSize('a'.repeat(40))).toBeGreaterThan(cardTitleSize('a'.repeat(100)))
})
