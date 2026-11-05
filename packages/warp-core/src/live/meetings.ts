// -- meetings (07 §3) --------------------------------------------------------------------------------------------------

/** The least a call participant needs. */
export interface ParticipantLike {
  id: string
  name: string
  role?: string
  isSpeaking?: boolean
  isMuted?: boolean
  handRaised?: boolean
  network?: 'good' | 'poor'
}

/** "Kofi Mensah, host, speaking" / "Ana Ruiz, muted" (07 §3.4). */
export function tileLabel(p: ParticipantLike) {
  return [
    p.name,
    p.role,
    p.isSpeaking && 'speaking',
    p.isMuted && 'muted',
    p.handRaised && 'hand raised',
    p.network === 'poor' && 'poor connection',
  ]
    .filter(Boolean)
    .join(', ')
}

/** A stable data-palette slot (1 to 8) for an id; the server and the client agree. */
export function hueOf(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (h % 8) + 1
}

/** Gallery columns by head count (07 §3.1); the container takes it to 2 below 600. */
export const galleryCols = (n: number) => (n <= 4 ? 2 : n <= 9 ? 3 : 4)

/** Who raised a hand since `prev` (07 §3.4: hands are announced, speakers aren't). */
export const newHands = (prev: readonly ParticipantLike[], next: readonly ParticipantLike[]) =>
  next.filter((p) => p.handRaised && !prev.find((q) => q.id === p.id)?.handRaised)

/**
 * Follows the active speaker with a hold, to avoid flicker (07 §3.2: 1.5 s): a new speaker takes over only if they are
 * still the one speaking when the hold runs out, and only once the current one has held the stage that long.
 */
export function speakerFollow(
  onChange: (id: string) => void,
  { hold = 1500, now = () => Date.now() }: { hold?: number; now?: () => number } = {},
) {
  let current: string | undefined
  let since = 0
  let wanted: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const take = (id: string) => {
    current = id
    since = now()
    wanted = undefined
    onChange(id)
  }
  return {
    get current() {
      return current
    },
    update(id: string | undefined) {
      if (id === undefined || id === current) {
        wanted = undefined
        clearTimeout(timer)
        timer = undefined
        return
      }
      if (current === undefined) return take(id)
      if (id === wanted) return
      wanted = id
      clearTimeout(timer)
      timer = setTimeout(
        () => {
          timer = undefined
          if (wanted === id) take(id)
        },
        Math.max(0, since + hold - now()),
      )
    },
    destroy() {
      clearTimeout(timer)
    },
  }
}

/** The ring's way out (07 §3.2): when `on` goes false, `data-speaking-out` holds until the sweep has left. */
export function speakingOut(el: HTMLElement, on: boolean | undefined) {
  let was = !!on
  let timer: ReturnType<typeof setTimeout> | undefined
  const set = (next: boolean | undefined) => {
    if (was && !next) {
      el.setAttribute('data-speaking-out', '')
      clearTimeout(timer)
      const ms = parseFloat(getComputedStyle(el, '::after').transitionDuration) * 1000 || 250
      timer = setTimeout(() => el.removeAttribute('data-speaking-out'), ms + 40)
    } else if (next) {
      clearTimeout(timer)
      el.removeAttribute('data-speaking-out')
    }
    was = !!next
  }
  return { update: set, destroy: () => clearTimeout(timer) }
}

/** Off-screen tiles pause their <video> (07 §3.2); only what this paused plays again. */
export function pauseOffscreen(el: HTMLElement) {
  const win = el.ownerDocument.defaultView
  if (!win?.IntersectionObserver) return { update() {}, destroy() {} }
  const paused = new WeakSet<HTMLVideoElement>()
  const io = new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement
        if (!e.isIntersecting && !v.paused) {
          paused.add(v)
          v.pause()
        } else if (e.isIntersecting && paused.has(v)) {
          paused.delete(v)
          void v.play()?.catch(() => {})
        }
      }
    },
    { root: el },
  )
  const scan = () => {
    for (const v of el.querySelectorAll('video')) io.observe(v)
  }
  const mo = new win.MutationObserver(scan)
  mo.observe(el, { childList: true, subtree: true })
  scan()
  return {
    update() {},
    destroy() {
      io.disconnect()
      mo.disconnect()
    },
  }
}

/** Where a picture-in-picture window docks. */
export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
/** The corner an arrow key sends the self view to. */
export function pipStep(corner: PipCorner, key: string): PipCorner {
  const [y, x] = corner.split('-')
  const to =
    key === 'ArrowUp'
      ? `top-${x}`
      : key === 'ArrowDown'
        ? `bottom-${x}`
        : key === 'ArrowLeft'
          ? `${y}-left`
          : key === 'ArrowRight'
            ? `${y}-right`
            : corner
  return to as PipCorner
}

/**
 * The self view (07 §3.1): drag it, it snaps to the nearest corner of its stage; arrow keys move it corner to corner
 * (the non-drag path). It rests bottom right (the CSS), through `--_px`/`--_py`; `corner` is where it starts.
 */
export function pip(
  el: HTMLElement,
  opts: { corner?: PipCorner; onMove?(corner: PipCorner): void } = {},
) {
  let o = opts
  let corner: PipCorner = 'bottom-right'
  const rtl = () => getComputedStyle(el).direction === 'rtl'
  const snap = (c: PipCorner, quiet = false) => {
    corner = c
    const stage = (el.offsetParent ?? el.parentElement!) as HTMLElement
    const s = stage.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const k = b.width / (el.offsetWidth || b.width) || 1
    const left = c.endsWith('left')
    const maxX = (s.width - b.width) / k - 32
    const maxY = (s.height - b.height) / k - 96
    el.style.setProperty('--_px', `${rtl() ? (left ? 0 : maxX) : left ? -maxX : 0}px`)
    el.style.setProperty('--_py', `${c.startsWith('top') ? -maxY : 0}px`)
    if (!quiet) o.onMove?.(c)
  }
  let drag: { x: number; y: number; px: number; py: number } | null = null
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest?.('button')) return
    el.setPointerCapture?.(e.pointerId)
    el.setAttribute('data-dragging', '')
    const css = el.style
    drag = {
      x: e.clientX,
      y: e.clientY,
      px: parseFloat(css.getPropertyValue('--_px')) || 0,
      py: parseFloat(css.getPropertyValue('--_py')) || 0,
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const k = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1
    el.style.setProperty('--_px', `${drag.px + (e.clientX - drag.x) / k}px`)
    el.style.setProperty('--_py', `${drag.py + (e.clientY - drag.y) / k}px`)
  }
  const onUp = () => {
    if (!drag) return
    drag = null
    el.removeAttribute('data-dragging')
    const s = (el.offsetParent ?? el.parentElement!).getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const left = b.left + b.width / 2 < s.left + s.width / 2
    const top = b.top + b.height / 2 < s.top + s.height / 2
    snap(`${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`)
  }
  const onKey = (e: KeyboardEvent) => {
    const to = pipStep(corner, e.key)
    if (!e.key.startsWith('Arrow')) return
    e.preventDefault()
    if (to !== corner) snap(to)
  }
  const on: [string, (e: never) => void][] = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onUp],
    ['keydown', onKey],
  ]
  for (const [t, fn] of on) el.addEventListener(t, fn as EventListener)
  if (o.corner && o.corner !== corner) snap(o.corner, true)
  return {
    update(next: typeof opts) {
      o = next
      if (o.corner && o.corner !== corner) snap(o.corner, true)
    },
    destroy() {
      for (const [t, fn] of on) el.removeEventListener(t, fn as EventListener)
    },
  }
}

/** A reaction floating up from the control bar and fading (07 §3.2); it just fades under reduced motion. */
export function floatReaction(stage: HTMLElement, emoji: string) {
  const doc = stage.ownerDocument
  const e = doc.createElement('span')
  e.setAttribute('aria-hidden', 'true')
  e.textContent = emoji
  e.style.cssText =
    'position:absolute;inset-inline-start:50%;inset-block-end:20px;font-size:32px;z-index:500;pointer-events:none'
  stage.append(e)
  const still =
    doc.documentElement.dataset.motion === 'reduce' ||
    doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const run = e.animate?.(
    [
      { translate: '0 0', opacity: 1 },
      { translate: `0 ${still ? 0 : -180}px`, opacity: 0 },
    ],
    { duration: 1400, easing: 'ease-out', fill: 'forwards' },
  )
  if (run) run.onfinish = () => e.remove()
  else setTimeout(() => e.remove(), 1400)
  return e
}

/** Bars lit for a level from 0 to 1. */
export const litBars = (level: number, bars = 16) =>
  Math.max(0, Math.min(bars, Math.round(level * bars)))

/**
 * A segmented meter that reads `--level` off its own style, so the caller's 10 Hz updates never re-render (07 §3.4):
 * it lights the bars (`i[data-on]`) and keeps `aria-valuenow` true.
 */
export function levelMeter(el: HTMLElement) {
  const win = el.ownerDocument.defaultView!
  const bars = [...el.querySelectorAll('i')]
  const read = () => {
    const n = litBars(parseFloat(el.style.getPropertyValue('--level')) || 0, bars.length)
    bars.forEach((b, i) => b.toggleAttribute('data-on', i < n))
    el.setAttribute('aria-valuenow', String(n))
  }
  const mo = new win.MutationObserver(read)
  mo.observe(el, { attributes: true, attributeFilter: ['style'] })
  read()
  return { update: read, destroy: () => mo.disconnect() }
}

/** Minutes and seconds (hours once there are any) left, zero-padded; never below zero. */
export function countdownParts(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const parts = [
    { unit: 'min', value: pad(Math.floor((s % 3600) / 60)) },
    { unit: 'sec', value: pad(s % 60) },
  ]
  return h ? [{ unit: 'hr', value: pad(h) }, ...parts] : parts
}
/** What's left, as a countdown. */
export const countdownLabel = (ms: number) => {
  const m = Math.ceil(Math.max(0, ms) / 60000)
  return `Starts in ${m} ${m === 1 ? 'minute' : 'minutes'}`
}
