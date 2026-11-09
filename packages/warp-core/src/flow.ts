const arrival = (a: Animation) =>
  'animationName' in a && String(a.animationName).startsWith('warp-in-')

let installed = false

/**
 * warp.flow waits for a person. Until the first scroll the gate is shut (`:root:not([data-flow-armed])`), so the page
 * holds still and whole: what the first screen, a crawler and an audit read is every word at full contrast, never text
 * parked at opacity 0 below the fold. On that scroll, what is on screen is marked seen and stays put (no part-faded jump),
 * and everything below rises in as it arrives. Once a seen element has left the screen it flows like the rest. Without this script nothing is armed, so failed JS leaves a still page.
 */
export function flow(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
) {
  if (installed || !doc) return
  installed = true
  const root = doc.documentElement
  const arm = () => {
    seen(doc)
    root.dataset.flowArmed = ''
    release(doc)
    scans(doc)
    fallback(doc)
    settle(doc)
  }
  if (root.hasAttribute('data-flow-armed')) {
    scans(doc)
    fallback(doc)
    settle(doc)
  } else doc.addEventListener('scroll', arm, { capture: true, once: true, passive: true })
}

function finishArrival(animation: Animation, win: Window) {
  const effect = animation.effect as KeyframeEffect | null
  const progress = effect?.getComputedTiming().progress
  const el = effect?.target as HTMLElement | null
  if (!el || progress == null || progress <= 0 || progress >= 1 || el.dataset.flowSettled != null)
    return
  const rect = el.getBoundingClientRect()
  if (rect.bottom <= 0 || rect.top >= win.innerHeight) return
  const frames = effect!.getKeyframes()
  const properties = new Set(frames.flatMap((frame) => Object.keys(frame)))
  for (const key of ['offset', 'computedOffset', 'easing', 'composite']) properties.delete(key)
  const from: Record<string, string> = {},
    to: Record<string, string> = {}
  const read = (style: CSSStyleDeclaration, key: string) =>
    style.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
  const before = win.getComputedStyle(el)
  for (const key of properties) from[key] = read(before, key)
  // Keep both CSS animation slots so the exit retains its original range and timeline.
  el.dataset.flowSettled = ''
  const after = win.getComputedStyle(el)
  const time = after.getPropertyValue('--_flow-settle-time').trim()
  const duration = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
  const last = frames.at(-1)!
  for (const key of properties) to[key] = String(last[key] ?? read(after, key))
  const played = el.animate([from, to], {
    duration: Number.isFinite(duration) ? duration : 0,
    easing: after.getPropertyValue('--warp-ref-flow-ease').trim() || 'linear',
  })
  return { el, played }
}

/** Reduced motion hides the animations, so wait for its gate to open only on pages with flow. */
function waitForMotion(doc: Document) {
  const selector = families(doc)
  if (!selector || !doc.querySelector(selector)) return
  const win = doc.defaultView!
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)')
  const retry = () => {
    if (!doc.getAnimations().some(arrival)) return
    observer.disconnect()
    motion.removeEventListener('change', retry)
    settle(doc)
  }
  const observer = new win.MutationObserver(retry)
  motion.addEventListener('change', retry)
  observer.observe(doc.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-motion', 'data-flow', 'data-flow-seen'],
  })
}

/** Finish an interrupted arrival on a clock; the departure still belongs to its scroll timeline. */
function settle(doc: Document) {
  const win = doc.defaultView
  if (
    !win?.CSS?.supports('animation-timeline: view()') ||
    !doc.getAnimations ||
    !win.IntersectionObserver
  )
    return
  if (!doc.getAnimations().some(arrival)) return waitForMotion(doc)
  const running = new Map<HTMLElement, Animation>()
  const offscreen = new win.IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) continue
      const el = target as HTMLElement
      running.get(el)?.cancel()
      running.delete(el)
      delete el.dataset.flowSettled
      offscreen.unobserve(el)
    }
  })
  const finish = () => {
    for (const animation of doc.getAnimations()) {
      if (!arrival(animation)) continue
      const result = finishArrival(animation, win)
      if (!result) continue
      const { el, played } = result
      running.set(el, played)
      played.onfinish = () => running.delete(el)
      offscreen.observe(el)
    }
  }
  const native = 'onscrollend' in doc
  const interrupt = () => {
    for (const [el, animation] of running)
      if (
        win.getComputedStyle(el).getPropertyValue('--warp-flow-gate').trim() === 'none' ||
        el.matches(':focus-within,:target') ||
        el
          .getAnimations()
          .some(
            (a) =>
              'animationName' in a &&
              String(a.animationName).startsWith('warp-out-') &&
              (a.effect?.getComputedTiming().progress ?? 0) > 0,
          )
      ) {
        animation.cancel()
        running.delete(el)
      }
  }
  let timer = 0,
    frame = 0
  doc.addEventListener(
    'scroll',
    () => {
      // A fast fling may reach the header before the clock finishes; never cover that departure.
      if (running.size && !frame)
        frame = win.requestAnimationFrame(() => {
          frame = 0
          interrupt()
        })
      if (!native) {
        win.clearTimeout(timer)
        timer = win.setTimeout(finish, 150)
      }
    },
    { capture: true, passive: true },
  )
  if (native) doc.addEventListener('scrollend', finish, { capture: true, passive: true })
  doc.addEventListener('focusin', interrupt, { capture: true })
  win.addEventListener('hashchange', interrupt)
  win.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', interrupt)
  win.matchMedia('print').addEventListener('change', interrupt)
  new win.MutationObserver(interrupt).observe(doc.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-motion', 'data-flow'],
  })
}

/**
 * Mark what is on screen. warp.flow gives every element it moves `--_flow-in`, so this finds them without naming a
 * component (a selector here would keep that component's CSS in every bundle). Only the subtrees on screen are walked,
 * and below a marked element nothing is: `data-flow-seen` shuts the gate for its whole subtree.
 */
function seen(doc: Document) {
  const h = doc.defaultView?.innerHeight ?? 0
  const walk = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_ELEMENT)
  const skip = () => {
    while (!walk.nextSibling()) if (!walk.parentNode()) return false
    return true
  }
  let more = !!walk.firstChild()
  while (more) {
    const el = walk.currentNode as HTMLElement
    const r = el.getBoundingClientRect()
    const onScreen = r.top < h && r.bottom > 0
    if (onScreen && getComputedStyle(el).getPropertyValue('--_flow-in').trim())
      el.dataset.flowSeen = ''
    // a box off screen can still hold one that is on it (a fixed bar, an overflow), but warp's flowed blocks sit in the flow
    more = onScreen && !el.hasAttribute('data-flow-seen') ? !!walk.firstChild() || skip() : skip()
  }
}

/** A seen element that leaves the screen (the page, or a window it scrolls in) flows again: off screen, nothing jumps. */
function release(doc: Document) {
  const IO = doc.defaultView?.IntersectionObserver
  if (!IO) return
  const io = new IO((entries) => {
    for (const e of entries)
      if (!e.isIntersecting) {
        delete (e.target as HTMLElement).dataset.flowSeen
        io.unobserve(e.target)
      }
  })
  for (const el of doc.querySelectorAll('[data-flow-seen]')) io.observe(el)
}

/**
 * What warp.flow moves, read from the sheets: the rules that set `--_flow-r` (or `prop`), the reach each family's view() range reads.
 * The list lives in the CSS alone, so the fallback moves what the CSS moves, and the JS names no family: a name here is
 * a word in every build, and Weft's purge would keep every family's rules and keyframes for it. Custom properties
 * survive a parser that can't read animation-timeline, and a sheet behind @supports is still in the CSSOM.
 */
function families(doc: Document, prop = '--_flow-r') {
  const found: string[] = []
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
      if ('selectorText' in rule && (rule as CSSStyleRule).style.getPropertyValue(prop))
        found.push((rule as CSSStyleRule).selectorText)
    }
  }
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules)
    } catch {} // another origin's sheet
  }
  return found.join(',')
}

/**
 * A code block's scan waits below the fold and plays the moment it shows. Where it is drawn decides, transforms included,
 * so a view() range can't: a block inside a card that rises in has entered by its own box while the card still holds it
 * under the fold. The blocks are the rules that set `--_flow-scans`, read from the sheets like the families.
 */
function scans(doc: Document) {
  const sel = families(doc, '--_flow-scans')
  if (!sel || typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined')
    return
  const below = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    if (r.height && r.top >= innerHeight) el.dataset.flowScan = ''
  }
  // The root reaches up without end, so "not intersecting" is "below the fold", and a jump from above to below says so
  // too: with the plain viewport, a block that never crosses the screen on its way down is never reported.
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting, boundingClientRect: r } of entries) {
        const el = target as HTMLElement
        if (isIntersecting) delete el.dataset.flowScan
        else if (r.height) el.dataset.flowScan = ''
      }
    },
    { rootMargin: '1000000px 0px 0px 0px' },
  )
  // A block shown below the fold (a tab opened, a panel unfolded) never crosses the edge, so its box changing says so.
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) below(e.target as HTMLElement)
  })
  const take = (el: Element) => {
    below(el as HTMLElement)
    io.observe(el)
    ro.observe(el)
  }
  const watch = (node: Node) => {
    if (node.nodeType !== 1) return
    const el = node as Element
    if (el.matches(sel)) take(el)
    for (const f of el.querySelectorAll(sel)) take(f)
  }
  watch(doc.documentElement)
  new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(watch)
  }).observe(doc.documentElement, { childList: true, subtree: true })
}

/** Only where view() is missing. It hides nothing until it has seen an element below the fold, so failed JS can't trap content. */
function fallback(doc: Document) {
  if (typeof IntersectionObserver === 'undefined' || CSS.supports('animation-timeline: view()'))
    return
  let sel = '',
    sheets = -1
  const current = () => {
    if (!sel && doc.styleSheets.length !== sheets) {
      sheets = doc.styleSheets.length
      sel = families(doc)
    } // read again only when a sheet arrives
    return sel
  }
  const gated = (el: Element) =>
    !el.isConnected || getComputedStyle(el).getPropertyValue('--warp-flow-gate').trim() === 'none'
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting, boundingClientRect: r } of entries) {
        const el = target as HTMLElement
        if (isIntersecting) {
          if (el.dataset.flowState === 'wait') el.dataset.flowState = 'in'
        } else if (r.top > 0 && !gated(el)) el.dataset.flowState = 'wait'
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  const watch = (node: Node) => {
    if (node.nodeType !== 1) return
    if (!sel) {
      if (!current()) return
      node = doc.documentElement
    } // the sheet came late: take in what was already there
    const el = node as Element
    if (el.matches(sel)) io.observe(el)
    for (const f of el.querySelectorAll(sel)) io.observe(f)
  }
  watch(doc.documentElement)
  new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(watch)
  }).observe(doc.documentElement, { childList: true, subtree: true })
}
