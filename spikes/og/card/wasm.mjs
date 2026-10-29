// `@takumi-rs/wasm`: Workers, Netlify Edge, Vercel Edge. `module` is the compiled `takumi_wasm_bg.wasm` (isolates
// can't compile wasm from bytes at runtime, so the bundler imports it) or its bytes where compiling is allowed.
import init, { Renderer } from '@takumi-rs/wasm'

export async function wasm(module) {
  await init({ module_or_path: module })
  return { name: 'wasm', Renderer }
}
