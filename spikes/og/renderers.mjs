// The two pipelines behind research 20's `renderCard(html, size, fonts) → PNG`, written once for every runtime.
// Callers pass the runtime's own modules (native or wasm) and bytes; nothing here touches the file system.
import { fromHtml } from '@takumi-rs/helpers/html'
import { htmlToVNode } from './html-to-vnode.mjs'

export const SIZE = { width: 1200, height: 630 }

/**
 * weft's SSR writes `<!--[-->…<!--]-->` around holes that share a parent with other content, and `<!--,-->` between
 * adjacent texts, even with `hydratable: false`. Takumi's `fromHtml` (and satori-html, tried first for Satori) drop
 * the text before a comment ("Hello, <!--[-->Ada<!--]-->!" → "!"), so comments go before a parser sees the HTML.
 */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '')
export const AVATAR_URL = 'https://cdn.example.test/avatar.jpg'

/**
 * fonts: { woff, woff2 }, each { inter400, inter700, lora400i } as Uint8Array. Each renderer gets the smallest format
 * it reads: Satori reads TTF/OTF/WOFF but not WOFF2; Takumi's wasm build reads WOFF2 (and TTF) but not WOFF.
 */
const faces = (f) => [
  { name: 'Inter', data: f.inter400, weight: 400, style: 'normal' },
  { name: 'Inter', data: f.inter700, weight: 700, style: 'normal' },
  { name: 'Lora', data: f.lora400i, weight: 400, style: 'italic' },
]

/** Takumi: HTML → node tree (JS helper) → Rust layout + raster → PNG. `Renderer` is from core or wasm. */
export async function takumi({ Renderer, fonts, avatar }) {
  const renderer = new Renderer()
  for (const face of faces(fonts.woff2)) await renderer.registerFont(face)
  const images = [{ src: AVATAR_URL, data: avatar }]
  return async (html) => {
    const { node, css } = fromHtml(stripComments(html))
    return renderer.render(node, { ...SIZE, format: 'png', images, css })
  }
}

/** Satori + resvg: HTML → VNode (html-to-vnode.mjs) → Yoga → SVG → resvg → PNG. `Resvg` is resvg-js or resvg-wasm's. */
export async function satori({ satori, Resvg, fonts, avatar }) {
  const dataUri = `data:image/jpeg;base64,${base64(avatar)}`
  const satoriFonts = faces(fonts.woff)
  return async (html) => {
    const svg = await satori(htmlToVNode(stripComments(html).replaceAll(AVATAR_URL, dataUri)), {
      ...SIZE,
      fonts: satoriFonts,
    })
    return new Resvg(svg, {
      fitTo: { mode: 'width', value: SIZE.width },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng()
  }
}

function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const props = {
  default: {
    title: 'Fine-grained reactivity without the virtual DOM',
    description:
      'weft compiles TSX to direct DOM updates and renders the same components to HTML on the server.',
    site: { name: 'weft', url: 'weft.dev' },
  },
  avatar: {
    name: 'Ada Okafor',
    bio: 'Builds compilers, owls, and very small runtimes.',
    avatar: AVATAR_URL,
    stats: [
      { label: 'Commits', value: '1,284' },
      { label: 'Stars', value: '9.1k' },
      { label: 'Since', value: '2019' },
    ],
    site: { name: 'weft.dev/users/ada' },
  },
  stress: {
    title: 'A title long enough that it has to be cut off with an ellipsis somewhere',
    user: 'Ada',
    count: 3,
  },
}
