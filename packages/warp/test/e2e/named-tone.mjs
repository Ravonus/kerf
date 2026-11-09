// Compare generated named tones with the existing accent-seed paint in Chromium.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chromium } from 'playwright-core'
import { warp } from '../../plugin.mjs'

const core = new URL('../../../warp-core/styles/', import.meta.url)
const readCss = (path) => readFileSync(new URL(path, core), 'utf8')
const base = [
  'warp.css',
  'components/base.css',
  'components/button.css',
  'components/badge.css',
  'components/pill.css',
  'components/link.css',
  'components/nav.css',
]
  .map(readCss)
  .join('\n')
const env = { command: 'build', mode: 'production', root: process.cwd() }
const palette = warp({
  colors: { brand: 'ink', ink: '#112233' },
  themes: {
    ocean: { colors: { ink: '#b52650' } },
    sunset: { colors: { ink: '#238759' } },
  },
}).contribute(env).tokens.css
const refs = Object.fromEntries(
  Object.entries({ default: '#112233', ocean: '#b52650', sunset: '#238759' }).map(
    ([name, color]) => [name, warp({ seed: { accent: color } }).contribute(env).tokens.css],
  ),
)
const markup = (tone) => `
<button id="button" data-scope="button" data-tone="${tone}" data-sweep>Button<span data-part="sweep"></span></button>
<button id="frame" data-scope="button" data-tone="${tone}" data-emphasis="frame" data-sweep data-fill><span data-part="sweep-fill"></span><span id="frame-outline" data-part="sweep-outline"><i id="frame-stroke"></i></span><span id="frame-corners" data-part="sweep-corners"><i></i></span><span id="frame-label" data-part="sweep-label">Frame</span><span id="frame-content" data-part="sweep-content">Frame</span></button>
<span id="badge" data-scope="badge" data-tone="${tone}">Badge</span>
<span id="badge-solid" data-scope="badge" data-tone="${tone}" data-emphasis="solid">Badge</span>
<button id="pill" data-scope="pill" data-tone="${tone}" aria-pressed="true">Pill</button>
<a id="link" data-scope="link" data-tone="${tone}" href="#">Link</a>
<a id="subtle" data-scope="link" data-tone="${tone}" data-variant="subtle" href="#">Link</a>
<nav id="nav" data-scope="nav" data-tone="${tone}" data-axis="x"><a id="active" aria-current="page">Nav</a><span id="indicator" data-part="indicator"></span><span id="nested" data-scope="badge" data-tone="positive">Other</span></nav>`
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost')
  const name = u.searchParams.get('palette') ?? 'default'
  const ref = u.searchParams.has('reference')
  const theme = u.searchParams.get('theme') ?? 'light'
  const expression = u.searchParams.get('expression') ?? 'balanced'
  const sheet = ref ? refs[name] : palette
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(
    `<!doctype html><html data-theme="${theme}" data-expression="${expression}"${ref || name === 'default' ? '' : ` data-palette="${name}"`}><head><style>${base}\n${sheet}</style></head><body>${markup(ref ? 'accent' : 'brand')}</body></html>`,
  )
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage()
  const url = `http://127.0.0.1:${server.address().port}/`
  async function sample(query) {
    await page.goto(`${url}?${query}`)
    return page.evaluate(() => {
      const props = (id) => {
        const style = getComputedStyle(document.getElementById(id))
        return { color: style.color, bg: style.backgroundColor, border: style.borderColor }
      }
      return {
        button: props('button'),
        frameLabel: props('frame-label'),
        frameContent: props('frame-content'),
        frameOutline: props('frame-outline'),
        frameStroke: props('frame-stroke'),
        frameCorners: props('frame-corners'),
        badge: props('badge'),
        solid: props('badge-solid'),
        pill: props('pill'),
        link: props('link'),
        subtle: props('subtle'),
        active: props('active'),
        indicator: props('indicator'),
        nested: props('nested'),
        pseudo: getComputedStyle(document.getElementById('active'), '::after').backgroundColor,
      }
    })
  }
  let checked = 0
  for (const name of ['default', 'ocean', 'sunset'])
    for (const theme of ['light', 'dark'])
      for (const expression of ['quiet', 'balanced', 'vivid']) {
        const query = `palette=${name}&theme=${theme}&expression=${expression}`
        const actual = await sample(query),
          reference = await sample(`${query}&reference=1`)
        for (const key of [
          'button',
          'badge',
          'solid',
          'pill',
          'link',
          'indicator',
          'nested',
          'frameLabel',
          'frameContent',
          'frameOutline',
          'frameStroke',
          'frameCorners',
        ])
          assert.deepEqual(actual[key], reference[key], `${query} ${key}`)
        assert.equal(actual.subtle.color, reference.link.color, `${query} subtle link`)
        assert.equal(actual.active.color, reference.link.color, `${query} active nav`)
        assert.equal(actual.pseudo, reference.indicator.bg, `${query} pre-script indicator`)
        checked++
      }
  const ocean = await sample('palette=ocean&theme=dark&expression=vivid&reference=1')
  const sunset = await sample('palette=sunset&theme=dark&expression=vivid&reference=1')
  const nestedReference = await sample('palette=sunset&theme=light&expression=quiet&reference=1')
  await page.goto(`${url}?palette=default&theme=dark&expression=vivid`)
  const dynamic = await page.evaluate(() => {
    const node = document.getElementById('button')
    node.style.transition = 'none'
    const read = () => {
      const style = getComputedStyle(node)
      return {
        color: style.color,
        bg: style.backgroundColor,
        border: style.borderColor,
      }
    }
    document.documentElement.dataset.palette = 'ocean'
    const inherited = read()
    node.dataset.palette = 'sunset'
    const local = read()
    node.dataset.theme = 'light'
    node.dataset.expression = 'quiet'
    return { inherited, local, nested: read() }
  })
  assert.deepEqual(dynamic.inherited, ocean.button, 'dynamic inherited palette')
  assert.deepEqual(dynamic.local, sunset.button, 'explicit host palette')
  assert.deepEqual(dynamic.nested, nestedReference.button, 'nested theme and expression')
  assert.ok(!palette.includes('data-tone="unknown"'))
  assert.ok(!palette.includes('data-tone="ocean"'))
  await page.goto(`${url}?palette=default&theme=light&expression=quiet`)
  const unknown = await page.evaluate(() => {
    const node = document.getElementById('button')
    node.style.transition = 'none'
    const read = () => {
      const style = getComputedStyle(node)
      return [
        style.color,
        style.backgroundColor,
        style.borderColor,
        style.getPropertyValue('--warp-color-sweep').trim(),
        style.getPropertyValue('--_tone').trim(),
      ]
    }
    const results = []
    for (const theme of ['light', 'dark'])
      for (const expression of ['quiet', 'balanced', 'vivid'])
        for (const emphasis of ['', 'soft', 'outline', 'ghost', 'frame', 'link']) {
          document.documentElement.dataset.theme = theme
          document.documentElement.dataset.expression = expression
          if (emphasis) node.dataset.emphasis = emphasis
          else delete node.dataset.emphasis
          node.dataset.tone = 'unknown'
          const invalid = read()
          delete node.dataset.tone
          results.push({ theme, expression, emphasis, invalid, omitted: read() })
        }
    return results
  })
  for (const row of unknown)
    assert.deepEqual(
      row.invalid,
      row.omitted,
      `unknown tone ${row.theme}/${row.expression}/${row.emphasis}`,
    )
  console.log(`Named tones match accent seed paint in ${checked} palette/mode/expression contexts`)
} finally {
  await browser?.close()
  server.close()
}
