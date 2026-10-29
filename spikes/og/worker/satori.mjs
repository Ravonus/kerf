// What @vercel/og does on the edge: satori/standalone with its yoga wasm, then resvg-wasm.
//
// satori 0.32.0, not the 0.57.2 used on Node: from 0.33.0 (2026-08-20) satori shapes text with harfbuzzjs, whose Emscripten loader
// runs when satori's module is evaluated, reads `self.location.href` (workerd has none) and fetches `hb.wasm` next to
// it. satori/standalone neither ships that file nor takes it in `init()` (still true in 0.59.2). With a `location`
// shim and a fetch that answered `hb.wasm`, the promise still never settled: requests were cancelled as hung, and a
// top-level await of a warm-up render failed with "Top-level await in module is unsettled". So satori ≥ 0.33 (and @vercel/og 1.0.3, which bundles 0.33.5) doesn't
// run in workerd without patching it; 0.32.0 is the last release without harfbuzz.
import satori, { init as initSatori } from 'satori-032/standalone'
import yoga from '../node_modules/satori-032/yoga.wasm'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvg from '../node_modules/@resvg/resvg-wasm/index_bg.wasm'
import { satori as pipeline } from '../renderers.mjs'
import inter400 from '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'
import inter700 from '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff'
import lora400i from '../node_modules/@fontsource/lora/files/lora-latin-400-italic.woff'
import { avatarBytes as avatar, handler, u8 } from './shared.mjs'

const fonts = { woff: { inter400: u8(inter400), inter700: u8(inter700), lora400i: u8(lora400i) } }

export default handler(async () => {
  await Promise.all([initSatori(yoga), initWasm(resvg)])
  return pipeline({ satori, Resvg, fonts, avatar })
})
