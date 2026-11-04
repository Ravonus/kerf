// The sweep (SIGNATURE §1) is CSS: warp.css (@layer warp.signature) sets --_a on a [data-sweep] host while it is hovered,
// focused or held, and two registered edges draw the stroke from that one switch. This holds only what a selector can't.

/** The shared sweep: pin a host, play it once as feedback, read its timing. */
export interface SweepMachine {
  /** Hold a host active (data-pin) or release it. */
  pin(el: Element | null | undefined, on: boolean): void
  /** One full pass, in then out, as feedback (sent, saved, copied). */
  confirm(el: Element | null | undefined): void
  /** The host's real sweep duration in ms (0 under reduced motion). */
  duration(el?: Element | null): number
  /** CSS follows hosts on its own: these remain for callers from when a machine had to be told. */
  init(scope?: ParentNode): void
  sync(el: Element | null | undefined): void
  destroy(): void
}

const none = () => {}

/** The document's sweep helpers. Safe to call any number of times. */
export function installSweep(doc: Document = document): SweepMachine {
  const win = doc.defaultView!
  const duration = (el?: Element | null) => {
    const v = win
      .getComputedStyle(el ?? doc.body)
      .getPropertyValue('--warp-sweep-duration')
      .trim()
    return parseFloat(v) * (v.endsWith('ms') ? 1 : 1000) || 0
  }
  return {
    pin: (el, on) => {
      el?.toggleAttribute('data-pin', on)
    },
    confirm(el) {
      if (!el) return
      el.setAttribute('data-confirm', '')
      setTimeout(() => el.removeAttribute('data-confirm'), duration(el))
    },
    duration,
    init: none,
    sync: none,
    destroy: none,
  }
}

/** Action form: kept so a binding can name it; the sweep needs nothing from script. */
export function sweep(_el: Element) {
  return { update: none, destroy: none }
}
