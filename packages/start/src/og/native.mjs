// `@takumi-rs/core`: Node, Bun and Deno servers, `weft build`, Vercel and Netlify Node functions. A file of its own so
// an edge bundle (`@takumi-rs/wasm`, spikes/og/card/wasm.mjs) never pulls in the native addon. Both builds draw byte-identical cards (§9.4).
export async function native() {
  // Takumi's addon in the same process as a later Rolldown pass kills a Windows `weft build` (0xC0000005) before the
  // server is written. WEFT_START_DIR means a build, and the cards come out the same.
  if (globalThis.process?.platform === 'win32' && globalThis.process.env.WEFT_START_DIR) return wasmBackend(globalThis.process.env.WEFT_START_DIR)
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

/** The wasm renderer, found from `start` (the @weft-js/start directory) because a prerender runs from a bundle. */
export async function wasmBackend(start) {
  const [{ createRequire }, { readFile }, { dirname, join }, { pathToFileURL }] = await Promise.all(['node:module', 'node:fs/promises', 'node:path', 'node:url'].map(m => import(/* @vite-ignore */ m)))
  const root = dirname(dirname(createRequire(`${start}/package.json`).resolve('@takumi-rs/wasm')))
  const { default: init, Renderer } = await import(/* @vite-ignore */ pathToFileURL(join(root, 'dist/export.mjs')).href)
  await init({ module_or_path: await readFile(join(root, 'pkg/takumi_wasm_bg.wasm')) })
  return { name: 'wasm', Renderer }
}
