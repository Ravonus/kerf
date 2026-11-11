const PURE = {
  '@kerf-js/core': new Set(['For', 'mergeProps', 'untrack']),
  '@kerf-js/start': new Set(['Link']),
}
const OPAQUE = /^@kerf-js\/(?:core|start)(\/|$)/
const CODE = /\.[cm]?[jt]sx?$/
/** kerf API that needs nothing from the page and starts nothing by itself. */
const QUIET = {
  '@kerf-js/core': new Set([
    'state',
    'derived',
    'memo',
    'untrack',
    'batch',
    'flush',
    'onCleanup',
    'For',
    'mergeProps',
    'name',
    'getOwner',
    'view',
    'omit',
    'restOf',
  ]),
  '@kerf-js/core/style': { has: () => true },
  '@kerf-js/start': new Set(['Link', 'Form']),
}
const STARTS = new Set(['onMount', 'watch', 'effect'])
const DATA = new Set(['resource', 'Boundary'])
const BOXES = new Set(['state', 'derived', 'memo', 'defineState'])
/** Globals work may touch and still be its island's own: nothing here reaches past the island. */
const SAFE = new Set(
  `Array BigInt Boolean Date Error Infinity IntersectionObserver Intl JSON Map Math MutationObserver NaN Number Object Promise
  RegExp ResizeObserver Set String Symbol WeakMap WeakSet cancelAnimationFrame clearInterval clearTimeout console decodeURI decodeURIComponent encodeURI encodeURIComponent isFinite isNaN matchMedia parseFloat parseInt
  performance queueMicrotask requestAnimationFrame setInterval setTimeout structuredClone undefined`.split(
    /\s+/,
  ),
)
const isServer = (f) => /\/src\/server\//.test(f) || /\.server\.[cm]?[jt]sx?$/.test(f)

export { PURE, OPAQUE, CODE, QUIET, STARTS, DATA, BOXES, SAFE, isServer }
