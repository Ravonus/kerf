// A docs sidebar's behaviour, for any framework: which sections a viewer folded, kept in localStorage, and the current
// page brought into view inside the sidebar's own scroll, so arriving deep in a long list doesn't start at its top.

/** Section titles a viewer opened (`true`) or closed (`false`). A section with no entry follows the default. */
export type Folds = Record<string, boolean>

/** Options for the side navigation's scroll. */
export interface SideNavOptions {
  /** The current page's href. A change brings the new current link into view. */
  current?: string | undefined
}

/** The folds kept under `key`. Storage that is blocked, or holds something this didn't write, reads as none. */
export function readFolds(key: string): Folds {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'))
  } catch {
    return {}
  }
}

/** Keeps `folds` under `key`. Blocked or full storage is fine: the folds then last for this visit only. */
export function writeFolds(key: string, folds: Folds) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(folds))
  } catch {
    // Private windows and full quotas throw here. Nothing depends on the write.
  }
}

/**
 * Brings the current link (`aria-current="page"`) into view in `el`'s own scroll, a third of the way down, without
 * moving the page. Runs once on attach and again after the current page changes.
 */
export function sideNav(el: HTMLElement, _opts: SideNavOptions = {}) {
  const win = el.ownerDocument.defaultView
  let frame = 0
  const reveal = () => {
    const at = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (!at || el.scrollHeight <= el.clientHeight) return
    const box = el.getBoundingClientRect(), a = at.getBoundingClientRect()
    if (a.top < box.top || a.bottom > box.bottom) el.scrollTop += a.top - box.top - el.clientHeight / 3
  }
  // After the framework's own update, so a section the new page opened has its height.
  const later = () => { if (win) { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(reveal) } }
  later()
  return {
    update() { later() },
    destroy() { win?.cancelAnimationFrame(frame) },
  }
}
