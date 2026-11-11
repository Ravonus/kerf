// What a save in `weft dev` has to keep, in a real browser: typed input, a counter, focus and scroll, with no page load.
// Shared by the packed gates. Runs on Node, Bun and Deno. `prepare` writes the files, before the app's dev server starts.
import { sleep as wait } from '../../../scripts/lib/helpers.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch } from './cdp.mjs'

const FILES = {
  'src/components/HotCounter.tsx': `import { state } from '@weft-js/core'
export function HotCounter() {
  const n = state(0)
  return <button id="c" onClick={() => n.value++}>one {n.value}</button>
}
`,
  'src/server/hot.ts': `import { query } from '@weft-js/start'
export const who = query({ run: () => 'S1' })
`,
  'src/routes/hot.css': `#t { color: rgb(1, 2, 3) }
`,
  'src/routes/hot.tsx': `import { state } from '@weft-js/core'
import { HotCounter } from '#/components/HotCounter'
import { who } from '#/server/hot'
import './hot.css'
export const load = () => ({ v: 'L1' })
export default function Hot(props: { data: { v: string } }) {
  const q = who()
  const typed = state('')
  return <main>
    <h1 id="t">first</h1>
    <p id="l">{props.data.v}</p>
    <p id="q">{q.value}</p>
    <input id="i" value={typed.value} onInput={e => (typed.value = e.currentTarget.value)} />
    <input id="raw" />
    <HotCounter />
    <div id="box" style="height:80px;overflow:auto"><div style="height:800px">tall</div></div>
    <div style="height:3000px">page</div>
  </main>
}
`,
}

export function prepare(app) {
  mkdirSync(join(app, 'src/components'), { recursive: true })
  for (const file in FILES) writeFileSync(join(app, file), FILES[file])
}

async function until(what, ms, test) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      last = await test()
      if (last) return last
    } catch (e) {
      last = e.message
    }
    await wait(100)
  }
  throw new Error(`${what}: gave up, last saw ${JSON.stringify(last)}`)
}

const text = (id) => `document.querySelector('#${id}')?.textContent`
const STATE = `({
  page: window.__same, count: ${text('c')}.match(/\\d+$/)[0], typed: document.querySelector('#i').value, raw: document.querySelector('#raw').value,
  focus: document.activeElement.id, caret: document.querySelector('#i').selectionStart,
  box: document.querySelector('#box').scrollTop, scroll: document.scrollingElement.scrollTop,
})`

/**
 * Every kind of edit, against an open page. `base`: the dev server, `log()`: its output so far, `pass(what)`: reports
 * one check. Throws on the first that fails. Skips, saying so, where there's no browser.
 */
export async function hotChecks(app, base, log, pass) {
  if (!findChrome()) return pass('hot reload: skipped, no Chrome here (set CHROME)')
  const chrome = await launch()
  const read = (file) => readFileSync(join(app, file), 'utf8')
  const write = (file, content) => writeFileSync(join(app, file), content)
  try {
    const page = await chrome.page(`${base}/hot`)
    await until('the page hydrates', 60000, async () => {
      await page.eval(`document.querySelector('#c')?.click()`)
      return /[1-9]$/.test(await page.eval(text('c')))
    })
    const loaded = await page.eval(`performance.getEntriesByType('resource').map(r => r.name)`)
    const twice = duplicateUrls(loaded)
    if (twice.length)
      throw new Error(`a module loaded under two URLs: ${twice.slice(0, 3).join(', ')}`)
    await page.eval(
      `document.querySelector('#c').click(); window.__same = 1; document.querySelector('#i').focus()`,
    )
    await page.type('hello')
    await page.eval(
      `document.querySelector('#raw').value = 'by hand'; document.querySelector('#i').focus(); document.querySelector('#i').setSelectionRange(2, 2); document.querySelector('#box').scrollTo({ top: 120, behavior: 'instant' }); document.scrollingElement.scrollTo({ top: 400, behavior: 'instant' })`,
    ) // instant: warp scrolls smoothly by default, and a scroll still under way would read as lost state
    const KEPT = JSON.stringify(await page.eval(STATE))
    if (!/"typed":"hello".*"raw":"by hand"/.test(KEPT))
      throw new Error(`the page wasn't set up: ${KEPT}`)
    const kept = async (what) => {
      await wait(250)
      const now = JSON.stringify(await page.eval(STATE))
      if (now !== KEPT) throw new Error(`${what}: lost state: ${now}, wanted ${KEPT}`)
      pass(`hot reload: ${what}, with typed input, counter, focus and scroll kept`)
    }
    const shows = (what, id, wanted) =>
      until(what, 15000, () => page.eval(`${text(id)}.includes(${JSON.stringify(wanted)})`))

    write(
      'src/components/HotCounter.tsx',
      read('src/components/HotCounter.tsx').replace('one ', 'two '),
    )
    await shows('a component edit', 'c', 'two')
    await kept('component edit')
    const route = 'src/routes/hot.tsx'
    write(route, read(route).replace('first', 'second'))
    await shows('a route edit', 't', 'second')
    await kept('route edit')
    write('src/routes/hot.css', 'h1#t { color: rgb(9, 8, 7) }\n')
    await until('a CSS edit', 15000, () =>
      page.eval(`getComputedStyle(document.querySelector('#t')).color === 'rgb(9, 8, 7)'`),
    )
    await kept('CSS edit')
    write('src/server/hot.ts', read('src/server/hot.ts').replace('S1', 'S2'))
    await shows('a server function edit', 'q', 'S2')
    await kept('server function edit')
    write(route, read(route).replace('L1', 'L2'))
    await shows('a load edit', 'l', 'L2')
    await kept('load edit')

    // An agent's saves: faster than the watcher takes them, and the last has to win.
    for (let i = 1; i <= 30; i++) {
      write(
        'src/components/HotCounter.tsx',
        read('src/components/HotCounter.tsx').replace(/>\w+ \{n/, `>v${i} {n`),
      )
      await wait(i % 3 ? 5 : 30)
    }
    await shows('the last of 30 quick saves', 'c', 'v30')
    await kept('30 quick saves')

    await checkRecovery({ read, write, route, base, page, chrome, kept, pass })

    // Where a reload is right, the terminal says why.
    const loads = page.loads
    write('src/routes/hot2.tsx', 'export default function Two() {\n  return <p>two</p>\n}\n')
    await until('a reload for a new route', 15000, () => page.loads > loads)
    await until('the reason', 5000, () => log().includes('weft: full reload: routes/hot2.tsx'))
    pass('hot reload: a new route reloads, and the terminal says why')
    if (page.errors.length) throw new Error(`page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  } finally {
    await chrome.close()
  }
}

async function checkRecovery({ read, write, route, base, page, chrome, kept, pass }) {
  // A mistake, and its fix right behind it, over and over: a dropped save would leave the page on the mistake.
  const good = read(route)
  for (let i = 0; i < 6; i++) {
    write(route, good.replace('<main>', '<main'))
    await until(
      'the error shows',
      15000,
      async () =>
        (await fetch(`${base}/hot`, { headers: { accept: 'application/json' } })).status >= 500 ||
        i % 2,
    )
    write(route, good.replace('second', `fixed${i}`))
    await until(`fix ${i} recovers`, 15000, () => page.eval(`${text('t')} === 'fixed${i}'`))
    await until(`fix ${i} on the server`, 15000, async () =>
      (await (await fetch(`${base}/hot`)).text()).includes(`fixed${i}`),
    )
  }
  await kept('6 syntax errors, each fixed at once')

  // A tab that opens while the code is broken has no module to update, and comes back by itself.
  write(route, good.replace('<main>', '<main'))
  await until(
    'the error shows',
    15000,
    async () =>
      (await fetch(`${base}/hot`, { headers: { accept: 'application/json' } })).status >= 500,
  )
  const broken = await chrome.page(`${base}/hot`)
  await until('the failure page', 15000, () =>
    broken.eval(`document.title === 'This page failed to load'`),
  )
  await wait(500)
  write(route, good.replace('second', 'recovered'))
  await until('the failed tab recovers', 20000, () => broken.eval(`${text('t')} === 'recovered'`))
  pass('hot reload: a tab opened on a syntax error recovers when it is fixed')
}

function duplicateUrls(loaded) {
  return (
    loaded
      .filter((u) => /\.[jt]sx?(\?|$)/.test(u))
      // A route's instant-navigation shape is its own module, compiled from the same file.
      .filter((u) => !/[?&]weft-shape\b/.test(u))
      .map((u) => u.replace(/\?.*$/, ''))
      .filter((u, i, all) => all.indexOf(u) !== i)
  )
}
