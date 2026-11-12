// `@kerf-js/keel/gen`: model-made images as a build step. A recipe of slots goes through an adapter to
// distilled bases and a lock, so an ordinary build reads committed files and calls no model.
export { createBridgeAdapter } from './bridge.mjs'
export { canonical, requestDigest, sha256 } from './digest.mjs'
export { GenFailure, GenRefused, referenceGuard } from './guard.mjs'
export { createMockAdapter } from './mock.mjs'
export { decodePng } from './png.mjs'
export { buildPrompt } from './prompt.mjs'
export { checkRecipe, checkStyle, parseOut, resolveSlots } from './recipe.mjs'
export { planGen, runGen } from './run.mjs'
export { keelGen } from './vite.mjs'
