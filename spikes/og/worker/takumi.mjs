import init, { Renderer } from '@takumi-rs/wasm'
import wasm from '../node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm'
import { takumi } from '../renderers.mjs'
import inter400 from '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2'
import inter700 from '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2'
import lora400i from '../node_modules/@fontsource/lora/files/lora-latin-400-italic.woff2'
import { avatarBytes as avatar, handler, u8 } from './shared.mjs'

const fonts = { woff2: { inter400: u8(inter400), inter700: u8(inter700), lora400i: u8(lora400i) } }

export default handler(async () => {
  await init({ module_or_path: wasm })
  return takumi({ Renderer, fonts, avatar })
})
