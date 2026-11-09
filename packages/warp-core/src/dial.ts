// The six standard dials (01-foundations §13), the logic of the specimen settings bar (specimens/warp-bar.js) without
// its chrome: they live as data-* on a scope root (<html> by default), "auto" removes the attribute so the OS or the
// stop decides, and a page can deep-link them with ?expression=&fields=&theme=&density=&motion=&flair=.

/** Every dial with its allowed values: the settings a page's look and motion read. */
export const DIALS = {
  expression: { values: ['quiet', 'balanced', 'vivid'], initial: 'balanced' },
  fields: { values: ['floating', 'classic'], initial: 'floating' },
  theme: { values: ['auto', 'light', 'dark'], initial: 'auto' },
  density: { values: ['compact', 'cozy', 'comfortable'], initial: 'cozy' },
  motion: { values: ['auto', 'full', 'reduce'], initial: 'auto' },
  flair: { values: ['auto', 'sweep', 'none'], initial: 'auto' },
} as const

/** The name of a dial. */
export type Dial = keyof typeof DIALS
/** The values dial `D` allows. */
export type DialValue<D extends Dial> = (typeof DIALS)[D]['values'][number]
const AUTO_REMOVES = new Set<Dial>(['theme', 'motion', 'flair'])
// `dialScript` in @weft-js/warp/plugin reads this key before the first paint.
const KEY = 'warp:dials'
// Only an "auto" that removes the attribute goes unsaid. Any other value is kept as chosen, the initial one too: a page
// can set its own default (a head script, `warp({ dials })`), so leaving `balanced` out would hand it back to that default.
const unsaid = (name: Dial, value: string) => AUTO_REMOVES.has(name) && value === 'auto'

function remember(name: Dial, value: string) {
  try {
    const held = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (unsaid(name, value)) delete held[name]
    else held[name] = value
    localStorage.setItem(KEY, JSON.stringify(held))
  } catch {} // private windows and blocked storage: the dial still works for this page
}

/** The dial's value on `root` (its initial value when unset). */
export function getDial<D extends Dial>(
  name: D,
  root: HTMLElement = document.documentElement,
): DialValue<D> {
  return (root.dataset[name] as DialValue<D> | undefined) ?? DIALS[name].initial
}

/**
 * Write a dial on `root` and announce it (`warp:dial` on the document, detail `{ name, value }`). `transition` wraps
 * the write (a View Transition, a theme wipe): it must call `write()` exactly once.
 */
export function setDial<D extends Dial>(
  name: D,
  value: DialValue<D>,
  {
    root = document.documentElement,
    url = false,
    persist = false,
    transition,
  }: {
    root?: HTMLElement | undefined
    url?: boolean
    persist?: boolean
    transition?: (write: () => void) => void
  } = {},
) {
  if (!(DIALS[name].values as readonly string[]).includes(value))
    throw new RangeError(`${name} is one of ${DIALS[name].values.join(', ')}`)
  let done = false
  const write = () => {
    if (done) return
    done = true
    if (AUTO_REMOVES.has(name) && value === 'auto') delete root.dataset[name]
    else root.dataset[name] = value
    root.ownerDocument.dispatchEvent(new CustomEvent('warp:dial', { detail: { name, value } }))
  }
  if (persist) remember(name, value)
  if (url) {
    const q = new URLSearchParams(location.search)
    if (unsaid(name, value)) q.delete(name)
    else q.set(name, value)
    history.replaceState(history.state, '', (q.size ? `?${q}` : location.pathname) + location.hash)
  }
  if (transition) transition(write)
  else write()
}

/** Apply the dials a URL names (?expression=vivid…; ?stop= and ?dial= read as ?expression=). Unknown values are ignored. */
export function dialsFromUrl(
  search = location.search,
  root: HTMLElement = document.documentElement,
) {
  const q = new URLSearchParams(search)
  for (const alias of ['stop', 'dial'])
    if (q.has(alias) && !q.has('expression')) q.set('expression', q.get(alias)!)
  for (const name of Object.keys(DIALS) as Dial[]) {
    const v = q.get(name)
    if (v && (DIALS[name].values as readonly string[]).includes(v))
      setDial(name, v as DialValue<typeof name>, { root })
  }
}

/**
 * Switch the named theme (`warp({ themes })`) on `root`: `data-palette="<name>"`, or "auto" to go back to the default.
 * Names are the app's own, so any name is taken; one the stylesheet doesn't define leaves the default colours.
 * Announced as a `warp:dial` event like the others, and kept for the next visit with `persist`.
 */
export function setPalette(
  name: string,
  {
    root = document.documentElement,
    persist = false,
  }: { root?: HTMLElement; persist?: boolean } = {},
) {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new RangeError('a palette name is lowercase letters, digits and dashes')
  if (name === 'auto') delete root.dataset.palette
  else root.dataset.palette = name
  if (persist)
    try {
      const held = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      if (name === 'auto') delete held.palette
      else held.palette = name
      localStorage.setItem(KEY, JSON.stringify(held))
    } catch {} // the switch still works for this page
  root.ownerDocument.dispatchEvent(
    new CustomEvent('warp:dial', { detail: { name: 'palette', value: name } }),
  )
}

/** The named theme on `root` ("auto" when none is set). */
export const getPalette = (root: HTMLElement = document.documentElement) =>
  root.dataset.palette ?? 'auto'
