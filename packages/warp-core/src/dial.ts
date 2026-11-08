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
  palette: { values: ['auto', 'default'], initial: 'default' },
  flair: { values: ['auto', 'sweep', 'none'], initial: 'auto' },
} as const

/** The name of a dial. */
export type Dial = keyof typeof DIALS
/** The values dial `D` allows. */
export type DialValue<D extends Dial> = D extends 'palette'
  ? string
  : (typeof DIALS)[D]['values'][number]
const AUTO_REMOVES = new Set<Dial>(['theme', 'motion', 'flair', 'palette'])
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

function paletteNames(root: HTMLElement) {
  const documentRoot = root.ownerDocument.documentElement
  const names =
    root.ownerDocument.defaultView
      ?.getComputedStyle(documentRoot)
      .getPropertyValue('--warp-palette-names')
      .trim()
      .split(/\s+/) ?? []
  return new Set([
    'auto',
    'default',
    ...names.filter((name) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)),
  ])
}

/** The dial's value on `root` (its initial value when unset). */
export function getDial<D extends Dial>(
  name: D,
  root: HTMLElement = document.documentElement,
): DialValue<D> {
  if (name === 'palette') {
    const current = root.ownerDocument.defaultView
      ?.getComputedStyle(root)
      .getPropertyValue('--warp-palette-current')
      .trim()
    return (current || 'default') as DialValue<D>
  }
  return (root.dataset[name] ?? DIALS[name].initial) as DialValue<D>
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
  if (name === 'palette' && root !== root.ownerDocument.documentElement && (url || persist))
    throw new RangeError('palette persistence and URL require the document root')
  if (
    name === 'palette'
      ? !paletteNames(root).has(value)
      : !(DIALS[name].values as readonly string[]).includes(value)
  )
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
    if (
      v &&
      (name === 'palette'
        ? paletteNames(root).has(v)
        : (DIALS[name].values as readonly string[]).includes(v))
    )
      setDial(name, v, { root })
  }
}
