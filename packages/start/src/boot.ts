// All a page that's only being read runs (PLAN §11). It starts `full` (the router, the runtime) when the page needs code at once, when something happens on an island, or when an island that
// wants to be running, or that isn't in the first view and so wasn't preloaded, comes into view. A visitor who asked for
// less data gets it on interaction only. `#weft-route` and the islands' comments are read by `start()` once it's here.

/** What the inline script left on `window`: the queue, and how to play or wake it. */
export interface Held { q: unknown[]; p: (held: unknown) => void; w?: (k: Element, lead?: 1) => void; r?: 1; n?: unknown; l?: Element; d?: unknown }

export function boot(full: () => Promise<unknown>) {
  const q = (window as Window & { __wq?: Held }).__wq
  let io: IntersectionObserver | undefined // oxlint-disable-line prefer-const -- `go` reads it, and can run before it's set
  const go = () => {
    if (q) q.w = () => {}
    io?.disconnect()
    full().catch(() => {
      // No code is coming: what's held takes its default.
      if (!q) return
      q.r = 1
      q.q.splice(0).forEach(q.p)
    })
  }
  if (!q || q.n || q.q.length) return go()
  q.w = (k: Element, lead?: 1) => {
    if (lead) q.l = k
    go()
  }
  if (q.d) return
  const first = new WeakSet<Element>()
  const needs = new WeakSet<Element>()
  io = new IntersectionObserver(list => {
    for (const e of list) {
      const was = first.has(e.target)
      first.add(e.target)
      if (e.isIntersecting && (was || needs.has(e.target))) return go()
    }
  }, { rootMargin: '600px' })
  const w = document.createTreeWalker(document.body, 128)
  while (w.nextNode()) {
    const c = w.currentNode as Comment
    const el = c.data.startsWith('wi:') && c.nextElementSibling
    if (!el) continue
    if (JSON.parse(c.data.slice(3))[3] === 'v') needs.add(el)
    io.observe(el)
  }
}
