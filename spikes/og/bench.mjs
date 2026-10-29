// One cold run of one pipeline on Node or Bun: `node bench.mjs <pipeline> [warm N] [--save]`. Prints JSON.
// Pipelines: takumi-native, takumi-wasm, satori-resvg-js, satori-resvg-wasm. (@vercel/og 1.0.3's Node build throws
// `Dynamic require of "fs"` under plain Node ESM; it is satori + resvg-wasm + yoga inside, so satori-resvg-wasm stands in.)
// Times: `import` (loading the renderer's modules), `init` (wasm instantiate + font registration), `first` (the
// first render of each card), then N warm renders of each card for p50/p95. Run it in a fresh process per sample.
const t0 = performance.now()
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [pipeline, warmArg = '50', ...flags] = process.argv.slice(2)
const runtime = typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`
const file = p => new Uint8Array(readFileSync(join(here, p)))
const fontDir = 'node_modules/@fontsource'
const fontSet = ext => ({
  inter400: file(`${fontDir}/inter/files/inter-latin-400-normal.${ext}`),
  inter700: file(`${fontDir}/inter/files/inter-latin-700-normal.${ext}`),
  lora400i: file(`${fontDir}/lora/files/lora-latin-400-italic.${ext}`),
})
const fonts = { woff: fontSet('woff'), woff2: fontSet('woff2') }
const avatar = file('assets/avatar.jpg')
const { defaultCard, avatarCard, stressCard } = await import('./build/cards.mjs')
const R = await import('./renderers.mjs')
const tBase = performance.now()

let render
const tImport0 = performance.now()
let tImport1, tInit1
if (pipeline === 'takumi-native') {
  const { Renderer } = await import('@takumi-rs/core'); tImport1 = performance.now()
  render = await R.takumi({ Renderer, fonts, avatar })
} else if (pipeline === 'takumi-wasm') {
  const wasm = await import('@takumi-rs/wasm'); tImport1 = performance.now()
  await wasm.default({ module_or_path: file('node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm') })
  render = await R.takumi({ Renderer: wasm.Renderer, fonts, avatar })
} else if (pipeline === 'satori-resvg-js') {
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]); tImport1 = performance.now()
  render = await R.satori({ satori, Resvg, fonts, avatar })
} else if (pipeline === 'satori-resvg-wasm') {
  const [{ default: satori }, resvg] = await Promise.all([import('satori'), import('@resvg/resvg-wasm')]); tImport1 = performance.now()
  await resvg.initWasm(file('node_modules/@resvg/resvg-wasm/index_bg.wasm'))
  render = await R.satori({ satori, Resvg: resvg.Resvg, fonts, avatar })
} else throw new Error(`unknown pipeline ${pipeline}`)
tInit1 = performance.now()

const cards = { default: () => defaultCard(R.props.default), avatar: () => avatarCard(R.props.avatar) }
const out = { pipeline, runtime, importMs: tImport1 - tImport0, initMs: tInit1 - tImport1, baseMs: tBase - t0, first: {}, warm: {} }
mkdirSync(join(here, 'out'), { recursive: true })
if (flags.includes('--save')) {
  // Quality only; a renderer that throws on it is a finding, not a crash.
  const html = stressCard(R.props.stress)
  writeFileSync(join(here, 'out', 'stress.html'), html)
  try { writeFileSync(join(here, 'out', `stress.${pipeline}.png`), await render(html)) }
  catch (e) {
    // Satori throws on <li>; record it, then render the rest of the card without the list to compare the remainder.
    writeFileSync(join(here, 'out', `stress.${pipeline}.error.txt`), String(e?.stack ?? e))
    writeFileSync(join(here, 'out', `stress.${pipeline}.png`), await render(html.replace(/<ul[\s\S]*?<\/ul>/, '')))
  }
}
for (const [name, html] of Object.entries(cards)) {
  const s = performance.now()
  const png = await render(html())
  out.first[name] = performance.now() - s
  if (flags.includes('--save')) {
    mkdirSync(join(here, 'out'), { recursive: true })
    writeFileSync(join(here, 'out', `${name}.${pipeline}.png`), png)
    writeFileSync(join(here, 'out', `${name}.html`), html())
  }
}
const N = Number(warmArg)
for (const [name, html] of Object.entries(cards)) {
  const times = []
  for (let i = 0; i < N; i++) {
    const s = performance.now()
    await render(html()) // includes the weft SSR render and the HTML → tree step, as a request would
    times.push(performance.now() - s)
  }
  times.sort((a, b) => a - b)
  if (N) out.warm[name] = { p50: times[Math.floor(N * 0.5)], p95: times[Math.min(N - 1, Math.floor(N * 0.95))] }
}
out.totalColdMs = (tInit1 - t0) + out.first.default // process start → first default PNG (excludes runtime boot)
console.log(JSON.stringify(out))
