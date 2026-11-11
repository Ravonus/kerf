// @vitest-environment node
// Composing veneer parts can't break them, for every component: the a11y gallery (every component, the whole bundle
// loaded) is built, and each top-level component on each page is cloned into a plain box and into a Modal, a Card, a
// Popover and an Alert. Its parts must compute the same box in every host as in the plain one. Before part rules were
// scoped, an Alert in a Modal took the dialog's title and description type, a checkbox in a Modal took the dialog's
// mark, and flows' result mark reached every checkbox on the page. compose.browser.test.ts is the quick input-only
// version for the merge gate; this one is in the release gate (25 s).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as Playwright from 'playwright-core'
import { buildGallery } from '../scripts/a11y.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const PAGES = [
  'static',
  'added',
  'agent',
  'schedule',
  'live',
  'collab',
  'flow',
  'admin',
  'virtual',
].concat(['surfaces', 'charts', 'rich', 'table', 'shell', 'overlays', 'toasts'])

// what a host may not change: a part's box and paint geometry. Inherited text colour is the host's to set.
const PROPS = ['display', 'position', 'width', 'height', 'margin-top', 'margin-left', 'padding-top']
  .concat(['padding-left', 'border-top-width', 'border-top-left-radius', 'grid-template-columns'])
  .concat([
    'opacity',
    'transform',
    'clip-path',
    'mask-image',
    'font-size',
    'box-shadow',
    'background-image',
  ])

// each host's markup, and where the component goes in it; "plain" is the baseline
const HOSTS: [string, string, string][] = [
  ['plain', '<div data-slot></div>', '[data-slot]'],
  [
    'modal',
    '<dialog data-scope="dialog" data-presentation="inline" open><div data-part="header"><span data-part="mark"></span><h2 data-part="title">T</h2><p data-part="description">D</p></div><div data-part="body"></div><div data-part="footer"></div></dialog>',
    '[data-part="body"]',
  ],
  [
    'card',
    '<div data-scope="surface"><span data-part="eyebrow">E</span><span data-part="title">C</span><div data-part="content"></div></div>',
    '[data-part="content"]',
  ],
  [
    'popover',
    '<div data-scope="popover"><div data-part="content"></div></div>',
    '[data-part="content"]',
  ],
  [
    'alert',
    '<div data-scope="alert"><div data-part="title">A</div><div data-part="content"></div></div>',
    '[data-part="content"]',
  ],
]

let browser: Playwright.Browser
let dist: string
beforeAll(async () => {
  dist = await buildGallery(mkdtempSync(join(tmpdir(), 'veneer-compose-')))
  browser = await chromium.launch()
}, 240_000)
afterAll(async () => {
  await browser?.close()
  if (dist) rmSync(dist, { recursive: true, force: true })
})

const type = (file: string) =>
  file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'

async function open(page: string) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await tab.route('**/*', async (r) => {
    const path = new URL(r.request().url()).pathname
    const file = path === '/' ? '/index.html' : path
    await r.fulfill({ body: readFileSync(join(dist, file)), contentType: type(file) })
  })
  await tab.addInitScript(() => {
    document.documentElement.dataset.expression = 'vivid'
  })
  await tab.goto(`http://gallery.test/?part=${page}`)
  await tab.waitForTimeout(1200)
  return tab
}

/** In the page: every part's box in each host that differs from the same component in the plain box. */
function compare([props, hosts]: [string[], [string, string, string][]]) {
  const still = document.createElement('style')
  still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
  document.head.append(still)
  const snap = (root: Element) =>
    [...root.querySelectorAll('*')].map((el) => {
      const s = getComputedStyle(el)
      return props.map((p) => s.getPropertyValue(p))
    })
  const name = (el: Element, root: Element) => {
    const chain: string[] = []
    for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement)
      if ((n as HTMLElement).dataset.scope) chain.push((n as HTMLElement).dataset.scope!)
    const at = (el as HTMLElement).dataset.part
    return `${el.tagName.toLowerCase()}${at ? `[${at}]` : ''} in ${chain.join('<')}`
  }
  const place = (root: HTMLElement, [host, html, slot]: [string, string, string]) => {
    const clone = root.cloneNode(true) as HTMLElement
    // a clone's radios would share a group with the original's and uncheck it
    let k = 0
    for (const i of clone.querySelectorAll<HTMLInputElement>('input[name]'))
      i.name = `${i.name}-${host}-${k++}`
    const t = document.createElement('template')
    t.innerHTML = html
    const outer = t.content.firstElementChild as HTMLElement
    const box = document.createElement('div')
    box.style.cssText = `inline-size:${root.getBoundingClientRect().width}px;font-size:16px;line-height:1.5`
    box.append(clone)
    ;(outer.matches(slot) ? outer : outer.querySelector(slot)!).append(box)
    document.body.append(outer)
    const got = snap(clone)
    const els = [...clone.querySelectorAll('*')].map((el) => name(el, clone))
    outer.remove()
    return { got, els }
  }
  const found: string[] = []
  const roots = [...document.querySelectorAll<HTMLElement>('[data-scope]')].filter(
    (el) =>
      !el.parentElement!.closest('[data-scope]') &&
      !el.closest('[popover], dialog') &&
      el.getBoundingClientRect().width > 0,
  )
  for (const root of roots) {
    const want = place(root, hosts[0]!).got
    for (const host of hosts.slice(1)) {
      const { got, els } = place(root, host)
      got.forEach((row, i) =>
        row.forEach((v, j) => {
          if (v !== want[i]![j])
            found.push(
              `${root.dataset.scope} in ${host[0]}: ${els[i]} ${props[j]} ${want[i]![j]} -> ${v}`,
            )
        }),
      )
    }
  }
  return found
}

test.each(PAGES)(
  'every component on gallery page %s renders the same inside a Modal, Card, Popover and Alert',
  async (page) => {
    const tab = await open(page)
    const found = await tab.evaluate(compare, [PROPS, HOSTS] as [
      string[],
      [string, string, string][],
    ])
    await tab.close()
    expect(found).toEqual([])
  },
  120_000,
)
