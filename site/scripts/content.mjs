import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { highlight, site, repo, reportSampleWidths } from './content/context.mjs'
import { SHOWN } from './content/displayed.mjs'
const { write, numbers, MOVED } = await import('./content/docs-catalog.mjs')
const { buildReference } = await import('./content/markdown.mjs')
const { buildLearn, buildSearch } = await import('./content/learn-search.mjs')
const { buildToolkit } = await import('./content/toolkit.mjs')
const { buildIcons, buildArt, buildShowcase, buildSpeed, buildLlms } =
  await import('./content/art.mjs')

reportSampleWidths(repo)
const docs = await buildReference()
const learn = buildLearn(docs)
const toolkit = buildToolkit()
// The stylesheet facts warp's theme compiler needs, so the theme studio can run it in the browser.
const { themeContext } = await import('../../packages/warp/src/plugin/theme-context.mjs')
const themeFacts = themeContext(new URL('../../packages/warp-core/', import.meta.url))
write('theme-context.json', {
  ...themeFacts,
  tokenNames: [...themeFacts.tokenNames].sort((a, b) => a.localeCompare(b)),
})
buildArt()
buildShowcase()
buildSpeed()
// The shop's steps, and any demo named `<name>-step-<n>`, mark the lines each one added, so the code shows the app growing.
// `ask` is a frame, so what it shows is the app inside it. `slow` shows the page it loads.
const demoText = (f) =>
  readFileSync(SHOWN[f] ? join(repo, SHOWN[f]) : join(site, `src/demos/${f}`), 'utf8').trim()
const demoHtml = (f) => {
  const text = demoText(f)
  const step = /^(shop|.+-step)-(\d+)\.tsx$/.exec(f)
  const before =
    step && step[2] !== '1'
      ? new Set(demoText(`${step[1]}-${step[2] - 1}.tsx`).split('\n'))
      : undefined
  let n = -1
  const lines = text.split('\n')
  const html = highlight(text, 'tsx').replace(/<span data-part="line"[^>]*>/g, (tag) =>
    before && lines[++n].trim() && !before.has(lines[n]) ? tag.replace('>', ' data-new="">') : tag,
  )
  return `<pre tabindex="0"><code>${html}</code></pre>`
}
// The arena's frames are built by ../benchmarks/arena/build.mjs and aren't in git. Without them the site says so instead of framing 404s.
const framed = (name) => existsSync(join(site, 'public/arena', name, 'index.html'))
const arena = { frames: ['weft', 'solid', 'react'].every(framed), graph: framed('graph') }
if (!arena.frames || !arena.graph)
  console.warn(
    '[content] Build arena frames: `pnpm install` then `node benchmarks/arena/build.mjs` (repo root).',
  )
write('arena-built.json', arena)
write(
  'demos.json',
  Object.fromEntries(
    readdirSync(join(site, 'src/demos'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => [f.slice(0, -4), demoHtml(f)]),
  ),
)
write('numbers.json', numbers())
write('reference-nav.json', docs.nav)
write('reference.json', docs.pages)
write('learn-nav.json', learn.nav)
write('learn-moved.json', MOVED)
write('learn.json', learn.pages)
const search = buildSearch(docs, learn, [...toolkit, ...buildIcons()])
buildLlms(docs, learn)
console.log(
  `[content] ${Object.keys(learn.pages).length} Learn and ${Object.keys(docs.pages).length} Reference pages; T0 ${search.counts.t0} rows ${(search.t0.br / 1024).toFixed(1)} KB br; T1 ${search.counts.t1} rows ${(search.t1.br / 1024).toFixed(1)} KB br`,
)
