import { announce } from '../toast'

// ---- step machine (09 §1.1) -----------------------------------------------------------------------------------------

/** Which way a step change moves, for the slide. */
export type FlowDirection = 'forward' | 'back'

/** Which way a step change moves: by position in `ids`. */
export const flowDirection = (ids: readonly string[], from: string, to: string): FlowDirection =>
  ids.indexOf(to) < ids.indexOf(from) ? 'back' : 'forward'

/** "Step 2 of 4, Shipping", what the polite region says on arrival. */
export const stepAnnouncement = (ids: readonly string[], id: string, label?: string) =>
  `Step ${ids.indexOf(id) + 1} of ${ids.length}${label ? `, ${label}` : ''}`

/** The step a URL names, when it names one of `ids`. */
export function stepFromSearch(search: string, param: string, ids: readonly string[]) {
  const v = new URLSearchParams(search).get(param)
  return v !== null && ids.includes(v) ? v : undefined
}

/** `href` with `?param=id`, keeping every other parameter. */
export function stepUrl(href: string, param: string, id: string) {
  const u = new URL(href)
  u.searchParams.set(param, id)
  return u.pathname + u.search + u.hash
}

/** Options for the step flow action. */
export interface StepFlowOptions {
  step: string
  steps: readonly string[]
  /** The label for a step: it is announced. */
  label(id: string): string | undefined
  /** The query parameter that mirrors the step; history stays alone without it. */
  history?: string | undefined
  /** A polite "Step 2 of 4, Shipping" on arrival (default true). */
  announce?: boolean | undefined
  /** The URL or Back moved the flow. */
  onStep(id: string): void
}

const STEP_TITLE = '[data-part="step-title"], [data-part-title], [data-part="title"][tabindex="-1"]'

/**
 * The step machine on `[data-scope="flow"]`: the binding renders `data-state="active"` on the current step; on a change
 * this marks the old one leaving until its exit ends, sets the direction, moves focus to the new step's
 * `[data-autofocus]` or title, announces, and keeps `?step=` in the history so Back goes back a step. Never gated on
 * the animation: the new step is live at once.
 */
export function stepFlow(el: HTMLElement, opts: StepFlowOptions) {
  let o = opts
  let at = o.step
  let live = true
  const doc = el.ownerDocument
  const win = doc.defaultView!
  const section = (id: string) =>
    [...el.children].find(
      (c) => (c as HTMLElement).dataset.part === 'step' && (c as HTMLElement).dataset.step === id,
    ) as HTMLElement | undefined

  function leave(step: HTMLElement) {
    step.dataset.state = 'leaving'
    const end = () => {
      if (live && step.dataset.state === 'leaving') delete step.dataset.state
    }
    const running = step.getAnimations?.() ?? []
    if (running.length) void Promise.allSettled(running.map((a) => a.finished)).then(end)
    else end()
  }

  function arrive(from: string, to: string, push: boolean) {
    el.dataset.dir = flowDirection(o.steps, from, to) === 'back' ? 'back' : 'forward'
    for (const s of el.querySelectorAll<HTMLElement>(
      ':scope > [data-part="step"][data-state="leaving"]',
    ))
      delete s.dataset.state
    const old = section(from),
      next = section(to)
    next?.toggleAttribute('data-after-exit', !!old)
    if (old && old !== next) leave(old)
    const target =
      next?.querySelector<HTMLElement>('[data-autofocus]') ??
      next?.querySelector<HTMLElement>(STEP_TITLE)
    target?.focus({ preventScroll: true })
    if (o.announce !== false) announce(doc, stepAnnouncement(o.steps, to, o.label(to)))
    if (push && o.history)
      win.history.pushState(win.history.state, '', stepUrl(win.location.href, o.history, to))
  }

  function moved(to: string, push: boolean) {
    const from = at
    if (from === to) return
    at = to
    // after the render that moved data-state="active": the effect that fed `update` runs in the same flush
    queueMicrotask(() => {
      if (live && at === to) arrive(from, to, push)
    })
  }

  const onPop = () => {
    if (!o.history) return
    const to = stepFromSearch(win.location.search, o.history, o.steps) ?? o.steps[0]!
    if (to === at) return
    moved(to, false)
    o.onStep(to)
  }
  win.addEventListener('popstate', onPop)
  if (o.history) {
    const named = stepFromSearch(win.location.search, o.history, o.steps)
    if (named && named !== at) {
      moved(named, false)
      o.onStep(named)
    } else if (!named)
      win.history.replaceState(win.history.state, '', stepUrl(win.location.href, o.history, at))
  }
  return {
    update(next: StepFlowOptions) {
      o = next
      moved(o.step, true)
    },
    destroy() {
      live = false
      win.removeEventListener('popstate', onPop)
    },
  }
}
