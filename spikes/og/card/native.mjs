// `@takumi-rs/core`: Node, Bun and Deno servers, `weft build`, Vercel and Netlify Node functions. A file of its own so
// an edge bundle (card/wasm.mjs) never pulls in the native addon. Both builds draw byte-identical cards (§9.4).
export async function native() {
  const { Renderer } = await import('@takumi-rs/core')
  return { name: 'native', Renderer }
}
