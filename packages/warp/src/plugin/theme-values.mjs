// How the theme compiler reads one configured value: the checks and formats its modules share.
export const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const bad = (path, message) => Object.assign(new Error(message), { path })
export const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const safe = (v) =>
  (typeof v === 'string' && v !== '' && !/[;{}<>]/.test(v)) || Number.isFinite(v)
export const px = (v) => (Number.isFinite(v) ? `${v}px` : v)

const stack = (v) =>
  v.includes(',') ? v : `${JSON.stringify(v)}, ui-sans-serif, system-ui, sans-serif`
export const fontValue = (v) =>
  ['sans', 'display', 'mono'].includes(v) ? `var(--warp-font-${v})` : stack(v)
