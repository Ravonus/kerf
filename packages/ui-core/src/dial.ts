// The six standard dials (01-foundations §13), the logic of the specimen settings bar (specimens/warp-bar.js) without
// its chrome: they live as data-* on a scope root (<html> by default), "auto" removes the attribute so the OS or the
// stop decides, and a page can deep-link them with ?expression=&fields=&theme=&density=&motion=&flair=.

export const DIALS = {
  expression: { values: ['quiet', 'balanced', 'vivid'], initial: 'balanced' },
  fields: { values: ['floating', 'classic'], initial: 'floating' },
  theme: { values: ['auto', 'light', 'dark'], initial: 'auto' },
  density: { values: ['compact', 'cozy', 'comfortable'], initial: 'cozy' },
  motion: { values: ['auto', 'full', 'reduce'], initial: 'auto' },
  flair: { values: ['auto', 'sweep', 'none'], initial: 'auto' },
} as const

export type Dial = keyof typeof DIALS
export type DialValue<D extends Dial> = (typeof DIALS)[D]['values'][number]
const AUTO_REMOVES = new Set<Dial>(['theme', 'motion', 'flair'])

/** The dial's value on `root` (its initial value when unset). */
export function getDial<D extends Dial>(name: D, root: HTMLElement = document.documentElement): DialValue<D> {
  return (root.dataset[name] as DialValue<D> | undefined) ?? DIALS[name].initial
}

/**
 * Write a dial on `root` and announce it (`warp:dial` on the document, detail `{ name, value }`). `transition` wraps
 * the write (a View Transition, a theme wipe): it must call `write()` exactly once.
 */
export function setDial<D extends Dial>(
  name: D,
  value: DialValue<D>,
  { root = document.documentElement, url = false, transition }: { root?: HTMLElement; url?: boolean; transition?: (write: () => void) => void } = {},
) {
  if (!(DIALS[name].values as readonly string[]).includes(value)) throw new RangeError(`${name} is one of ${DIALS[name].values.join(', ')}`)
  let done = false
  const write = () => {
    if (done) return
    done = true
    if (AUTO_REMOVES.has(name) && value === 'auto') delete root.dataset[name]
    else root.dataset[name] = value
    root.ownerDocument.dispatchEvent(new CustomEvent('warp:dial', { detail: { name, value } }))
  }
  if (url) {
    const q = new URLSearchParams(location.search)
    if (value === DIALS[name].initial) q.delete(name)
    else q.set(name, value)
    history.replaceState(history.state, '', (q.size ? `?${q}` : location.pathname) + location.hash)
  }
  if (transition) transition(write)
  else write()
}

/** Apply the dials a URL names (?expression=vivid…; ?stop= and ?dial= read as ?expression=). Unknown values are ignored. */
export function dialsFromUrl(search = location.search, root: HTMLElement = document.documentElement) {
  const q = new URLSearchParams(search)
  for (const alias of ['stop', 'dial']) if (q.has(alias) && !q.has('expression')) q.set('expression', q.get(alias)!)
  for (const name of Object.keys(DIALS) as Dial[]) {
    const v = q.get(name)
    if (v && (DIALS[name].values as readonly string[]).includes(v)) setDial(name, v as DialValue<typeof name>, { root })
  }
}
