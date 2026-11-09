// A docs sidebar's behaviour, for any framework: which sections a viewer folded, kept in localStorage; the current page
// brought into view inside the sidebar's own scroll; and the collapse bar at the panel's edge. Where the CSS lays the
// panel over the page (a phone) the bar, or any button whose aria-controls names the panel, opens it, with focus
// trapped, the bar, Escape, the backdrop and a link closing it, and focus going back to the bar or that button. Where
// the panel is docked the bar folds it to the bar's width and back.

/** Section titles a viewer opened (`true`) or closed (`false`). A section with no entry follows the default. */
export type Folds = Record<string, boolean>

/** Options for the side navigation. */
export interface SideNavOptions {
  /** The current page's href. A change brings the new current link into view. */
  current?: string | undefined
  /** Whether the overlaid panel is open. Ignored while the panel is docked. */
  open?: boolean | undefined
  /** Asked to open or close: the bar, a controlling button, Escape, the backdrop, the close button or a link. */
  onOpenChange?: ((open: boolean) => void) | undefined
  /** Whether the docked panel is folded to its bar. Ignored while the panel is overlaid. */
  collapsed?: boolean | undefined
  /** Asked to fold or unfold the docked panel: its bar was pressed. */
  onCollapsedChange?: ((collapsed: boolean) => void) | undefined
}

/** The folds kept under `key`. Storage that is blocked, or holds something this didn't write, reads as none. */
export function readFolds(key: string): Folds {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'),
    )
  } catch {
    return {}
  }
}

/** Whether the docked panel was left folded, kept under `key`. Blocked storage reads as unfolded. */
export function readCollapsed(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Keeps the docked panel's fold under `key`. Blocked or full storage is fine: it then lasts for this visit only. */
export function writeCollapsed(key: string, collapsed: boolean) {
  try {
    globalThis.localStorage?.setItem(key, collapsed ? '1' : '0')
  } catch {
    // As writeFolds: nothing depends on the write.
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

type SideNavState = { opener: HTMLElement | null; shown: boolean }
type SideNavCtx = {
  el: HTMLElement
  panel: HTMLElement
  bar: HTMLElement | null
  doc: Document
  win: Window | null
  state: SideNavState
  options: () => SideNavOptions
  overlaid: () => boolean
  controllers: () => HTMLElement[]
  ask: (open: boolean) => void
  later: () => void
}

function sideNavClick({ el, panel, bar, state, options, overlaid, controllers, ask }: SideNavCtx) {
  const setOpener = (opener: HTMLElement) => {
    state.opener = opener
  }
  return (e: MouseEvent) => {
    const t = e.target as Element | null
    if (bar && t && bar.contains(t)) {
      e.preventDefault()
      if (!overlaid()) {
        options().onCollapsedChange?.(!options().collapsed)
        return
      }
      if (!options().open) setOpener(bar)
      ask(!options().open)
      return
    }
    const button = t?.closest?.('[aria-controls]')
    if (button && !panel.contains(button) && controllers().includes(button as HTMLElement)) {
      if (!overlaid()) return
      e.preventDefault()
      setOpener(button as HTMLElement)
      ask(!options().open)
      return
    }
    if (!options().open) return
    if (t?.closest?.('[data-part="backdrop"]') && el.contains(t)) ask(false)
    else if (t?.closest?.('[data-part="close"], a[href]') && panel.contains(t)) ask(false)
  }
}

function sideNavKey(e: KeyboardEvent, { options, overlaid, ask, panel, doc }: SideNavCtx) {
  if (!options().open || !overlaid()) return
  if (e.key === 'Escape') {
    e.preventDefault()
    ask(false)
    return
  }
  if (e.key !== 'Tab') return
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (n) => n.getClientRects().length > 0,
  )
  if (!items.length) return
  const first = items[0]!,
    last = items.at(-1)!
  const at = doc.activeElement
  if (e.shiftKey && (at === first || !panel.contains(at))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
    e.preventDefault()
    first.focus()
  }
}

function sideNavReveal(scroller: HTMLElement, win: Window | null) {
  let frame = 0
  const reveal = () => {
    const at = scroller.querySelector<HTMLElement>('[aria-current="page"]')
    if (!at || scroller.scrollHeight <= scroller.clientHeight) return
    const box = scroller.getBoundingClientRect(),
      a = at.getBoundingClientRect()
    if (a.top < box.top || a.bottom > box.bottom)
      scroller.scrollTop += a.top - box.top - scroller.clientHeight / 3
  }
  // After the framework's own update, so a section the new page opened has its height.
  const later = () => {
    if (win) {
      win.cancelAnimationFrame(frame)
      frame = win.requestAnimationFrame(reveal)
    }
  }
  return { later, destroy: () => win?.cancelAnimationFrame(frame) }
}

function sideNavSync({
  state,
  options,
  overlaid,
  controllers,
  bar,
  panel,
  doc,
  win,
  later,
}: SideNavCtx) {
  return () => {
    const over = overlaid(),
      open = !!options().open && over
    for (const b of controllers()) b.setAttribute('aria-expanded', open ? 'true' : 'false')
    bar?.setAttribute('aria-expanded', (over ? open : !options().collapsed) ? 'true' : 'false')
    if (open === state.shown) return
    state.shown = open
    if (open) {
      state.opener ??= doc.activeElement instanceof HTMLElement ? doc.activeElement : null
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      const title = panel.querySelector('[data-part="title"]')
      if (title?.id) panel.setAttribute('aria-labelledby', title.id)
      doc.documentElement.style.overflow = 'hidden'
      later()
      win?.requestAnimationFrame(() =>
        (panel.querySelector<HTMLElement>('[data-part="close"]') ?? panel).focus(),
      )
    } else {
      panel.removeAttribute('role')
      panel.removeAttribute('aria-modal')
      panel.removeAttribute('aria-labelledby')
      doc.documentElement.style.overflow = ''
      // Back to what opened it, or the bar, unless focus has already gone somewhere else on the page.
      const at = doc.activeElement,
        back = state.opener?.isConnected ? state.opener : bar
      if (back && (!at || at === doc.body || panel.contains(at))) back.focus()
      state.opener = null
    }
  }
}

/**
 * `el` is the side navigation's root, holding `[data-part="panel"]` (with an id), `[data-part="scroll"]`,
 * `[data-part="backdrop"]` and, inside the panel, an optional `[data-part="bar"]` button. Whether the panel is overlaid
 * is read from its computed `position` (`fixed`), so the breakpoint lives in the CSS only. The bar's `aria-expanded`
 * is kept here, since only the CSS knows which of the two it is.
 */
export function sideNav(el: HTMLElement, opts: SideNavOptions = {}) {
  const doc = el.ownerDocument,
    win = doc.defaultView
  const panel = el.querySelector<HTMLElement>('[data-part="panel"]') ?? el
  const scroller = el.querySelector<HTMLElement>('[data-part="scroll"]') ?? panel
  const bar = panel.querySelector<HTMLElement>('[data-part="bar"]')
  let o = opts
  const state: SideNavState = { opener: null, shown: false }
  const overlaid = () => !!win && win.getComputedStyle(panel).position === 'fixed'
  const controllers = () =>
    panel.id
      ? [...doc.querySelectorAll<HTMLElement>(`[aria-controls~="${panel.id}"]`)].filter(
          (b) => !panel.contains(b),
        )
      : []
  const ask = (open: boolean) => o.onOpenChange?.(open)

  const reveal = sideNavReveal(scroller, win)
  const later = reveal.later

  const c: SideNavCtx = {
    el,
    panel,
    bar,
    doc,
    win,
    state,
    options: () => o,
    overlaid,
    controllers,
    ask,
    later,
  }
  const onDocClick = sideNavClick(c)
  const onKey = (e: KeyboardEvent) => sideNavKey(e, c)
  doc.addEventListener('click', onDocClick)
  doc.addEventListener('keydown', onKey)

  const sync = sideNavSync(c)
  // A phone turned wide while the panel was open: the panel docks, so the modal state goes.
  const onResize = () => {
    if (o.open && !overlaid()) ask(false)
    sync()
  }
  win?.addEventListener('resize', onResize)
  // A fold read from storage just after this lands as it is, not as a fold in motion: transitions wait two frames.
  let settle = 0
  el.setAttribute('data-settling', '')
  if (win)
    settle = win.requestAnimationFrame(() => {
      settle = win.requestAnimationFrame(() => el.removeAttribute('data-settling'))
    })
  else el.removeAttribute('data-settling')
  sync()
  later()
  return {
    update(next: SideNavOptions) {
      const moved = next.current !== o.current
      o = next
      sync()
      if (moved) later()
    },
    destroy() {
      reveal.destroy()
      win?.cancelAnimationFrame(settle)
      el.removeAttribute('data-settling')
      doc.removeEventListener('click', onDocClick)
      doc.removeEventListener('keydown', onKey)
      win?.removeEventListener('resize', onResize)
      if (state.shown) doc.documentElement.style.overflow = ''
    },
  }
}
