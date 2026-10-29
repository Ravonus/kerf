// The worker side of the spike: the avatar as a bundled Data module (fonts are imported by each worker, in the one
// format its renderer reads), and the same adapters as on Node. workerd's clocks only advance on I/O, so timings are
// taken by the client (worker/client.mjs), not in here.
import avatar from '../assets/avatar.jpg'
import { defaultCard, avatarCard } from '../build/cards.mjs'
import { props } from '../renderers.mjs'

export const u8 = b => new Uint8Array(b)
export const avatarBytes = u8(avatar)
const cards = { default: () => defaultCard(props.default), avatar: () => avatarCard(props.avatar) }

/** `GET /?card=default|avatar` → PNG; `/ping` → empty (the client subtracts its latency). */
export function handler(setup) {
  let render // one renderer per isolate, created on the first request (the cold path)
  return {
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/ping') return new Response('')
      render ??= await setup()
      const png = await render((cards[url.searchParams.get('card')] ?? cards.default)())
      return new Response(png, { headers: { 'content-type': 'image/png' } })
    },
  }
}
