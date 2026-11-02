// `@takumi-rs/core`: Node, Bun and Deno servers, `weft build`, Vercel and Netlify Node functions. A file of its own so
// an edge bundle (`@takumi-rs/wasm`, spikes/og/card/wasm.mjs) never pulls in the native addon. Both builds draw byte-identical cards (§9.4).
export async function native() {
  const { Renderer } = await import('@takumi-rs/core').catch(linked)
  return { name: 'native', Renderer }
}

/**
 * A prerender runs from a bundle in the app's `node_modules/.nitro`. An app that links `@weft-js/start` from a workspace
 * has no hoisted `@takumi-rs/core` there, so a build says where @weft-js/start is (app.mjs).
 */
async function linked(error) {
  const from = globalThis.process?.env.WEFT_START_DIR
  if (!from) throw error
  const { createRequire } = await import('node:module')
  return createRequire(`${from}/package.json`)('@takumi-rs/core')
}
