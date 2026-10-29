// The renderCard prototype (card/) as a Worker: Takumi wasm, the same WOFF fonts Satori used (unpacked to SFNT in the
// isolate), and the avatar fetched from `?avatar=<url>` when given (else the bundled bytes as a data URI).
import wasmModule from '../node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm'
import inter400 from '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'
import inter700 from '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff'
import lora400i from '../node_modules/@fontsource/lora/files/lora-latin-400-italic.woff'
import avatar from '../assets/avatar.jpg'
import { createCardRenderer, cardResponse } from '../card/index.mjs'
import { wasm } from '../card/wasm.mjs'
import { defaultCard, avatarCard } from '../build/cards.mjs'
import { props } from '../renderers.mjs'

const fonts = [
  { name: 'Inter', data: inter400, weight: 400, style: 'normal' },
  { name: 'Inter', data: inter700, weight: 700, style: 'normal' },
  { name: 'Lora', data: lora400i, weight: 400, style: 'italic' },
]
const dataUri = `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(avatar)))}`
let card

export default {
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/ping') return new Response('')
    card ??= await createCardRenderer({ backend: await wasm(wasmModule), fonts, images: { allow: () => true } })
    const html = url.searchParams.get('card') === 'avatar'
      ? avatarCard({ ...props.avatar, avatar: url.searchParams.get('avatar') ?? dataUri })
      : defaultCard(props.default)
    return cardResponse(await card.render(html))
  },
}
