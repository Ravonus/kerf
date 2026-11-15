// One scroll listener and one read batch for every registered artwork on a page.
import { mediaConnection, slowMediaConnection } from './media-network'
import { mediaViewportPlan } from './media-viewport-policy'
import type { MediaViewportBox, MediaViewportState } from './media-viewport-policy'
export type { MediaViewportState } from './media-viewport-policy'
interface Entry {
  element: HTMLElement
  minimumVisible: number
  notify: (state: MediaViewportState) => void
  last?: string
}
const trackers = new WeakMap<Document, ViewportTracker>()
class ViewportTracker {
  entries = new Set<Entry>()
  frame = 0
  y: number
  time = 0
  velocity = 0
  direction = 1
  target: number | undefined
  idle: ReturnType<typeof setTimeout> | undefined
  expiry: ReturnType<typeof setTimeout> | undefined
  resize: ResizeObserver | undefined
  constructor(
    readonly doc: Document,
    readonly win: Window,
  ) {
    this.y = win.scrollY
    win.addEventListener('scroll', this.scrolled, { passive: true })
    win.addEventListener('resize', this.schedule)
    win.addEventListener('wheel', this.cancelIntent, { passive: true })
    win.addEventListener('touchstart', this.cancelIntent, { passive: true })
    win.addEventListener('keydown', this.cancelIntent, true)
    win.addEventListener('kerf:scroll-target', this.intent)
    doc.addEventListener('visibilitychange', this.schedule)
    doc.addEventListener('load', this.schedule, true)
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(this.schedule)
      this.resize.observe(doc.body)
    }
  }
  schedule = () => {
    this.frame ||= this.win.requestAnimationFrame(this.update)
  }
  scrolled = () => {
    const now = this.win.performance.now(),
      y = this.win.scrollY,
      delta = y - this.y
    const dt = Math.max(8, Math.min(120, now - this.time || 16))
    if (delta) this.direction = Math.sign(delta)
    const speed = delta / dt
    this.velocity =
      Math.abs(delta) > this.win.innerHeight * 1.3
        ? 0
        : Math.sign(speed) !== Math.sign(this.velocity)
          ? speed
          : this.velocity * 0.35 + speed * 0.65
    this.y = y
    this.time = now
    if (this.target !== undefined && Math.abs(y - this.target) < 3) this.target = undefined
    clearTimeout(this.idle)
    this.idle = setTimeout(() => {
      this.velocity = 0
      this.schedule()
    }, 180)
    this.schedule()
  }
  cancelIntent = () => {
    this.target = undefined
    clearTimeout(this.expiry)
    this.schedule()
  }
  intent = (event: Event) => {
    const top = (event as CustomEvent<{ top?: number }>).detail?.top
    if (typeof top !== 'number' || !Number.isFinite(top)) return
    this.target = Math.max(0, top)
    this.direction = Math.sign(top - this.win.scrollY) || this.direction
    clearTimeout(this.expiry)
    this.expiry = setTimeout(() => {
      this.target = undefined
      this.schedule()
    }, 1400)
    this.schedule()
  }
  update = () => {
    this.frame = 0
    const entries = [...this.entries]
    const y = this.win.scrollY
    const boxes: MediaViewportBox[] = entries.map((entry) => {
      const b = entry.element.getBoundingClientRect()
      return {
        top: b.top + y,
        bottom: b.bottom + y,
        left: b.left,
        right: b.right,
        minimumVisible: entry.minimumVisible,
      }
    })
    const connection = mediaConnection()
    const states = mediaViewportPlan(boxes, {
      y,
      velocity: this.velocity,
      direction: this.direction,
      height: this.win.innerHeight,
      width: this.win.innerWidth,
      target: this.target,
      slow: slowMediaConnection(connection),
      speculate: !connection.saveData,
    })
    entries.forEach((entry, i) => {
      const state =
        this.doc.hidden || !entry.element.isConnected
          ? { visible: false, intersecting: false, preparing: false, anticipating: false }
          : states[i]!
      const key = JSON.stringify(state)
      if (key !== entry.last) {
        entry.last = key
        entry.notify(state)
      }
    })
  }
  destroy() {
    this.win.cancelAnimationFrame(this.frame)
    clearTimeout(this.idle)
    clearTimeout(this.expiry)
    this.resize?.disconnect()
    this.win.removeEventListener('scroll', this.scrolled)
    this.win.removeEventListener('resize', this.schedule)
    this.win.removeEventListener('wheel', this.cancelIntent)
    this.win.removeEventListener('touchstart', this.cancelIntent)
    this.win.removeEventListener('keydown', this.cancelIntent, true)
    this.win.removeEventListener('kerf:scroll-target', this.intent)
    this.doc.removeEventListener('visibilitychange', this.schedule)
    this.doc.removeEventListener('load', this.schedule, true)
    trackers.delete(this.doc)
  }
}
/** Predict upcoming media from real scroll motion and scrollbar intents; disposing removes its registration. */
export function observeMediaViewport(
  element: HTMLElement,
  notify: (state: MediaViewportState) => void,
  minimumVisible = 0.1,
) {
  const doc = element.ownerDocument,
    win = doc.defaultView
  if (!win) return () => {}
  let tracker = trackers.get(doc)
  if (!tracker) {
    tracker = new ViewportTracker(doc, win)
    trackers.set(doc, tracker)
  }
  const entry: Entry = { element, notify, minimumVisible: Math.max(0, Math.min(1, minimumVisible)) }
  tracker.entries.add(entry)
  tracker.schedule()
  return () => {
    tracker.entries.delete(entry)
    if (!tracker.entries.size) tracker.destroy()
  }
}
