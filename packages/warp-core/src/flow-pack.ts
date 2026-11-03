// The warp-core half of the flow pack (09): the step machine, error mapping, passwords, the OTP input, the tour's
// spotlight, connection states and the shortcuts registry. Pure functions and actions; no framework, no server.
import { pushLayer } from './layers'
import { installSweep } from './sweep'
import { announce } from './toast'

// ---- step machine (09 §1.1) -----------------------------------------------------------------------------------------

/** Which way a step change moves, for the slide. */
export type FlowDirection = 'forward' | 'back'

/** Which way a step change moves: by position in `ids`. */
export const flowDirection = (ids: readonly string[], from: string, to: string): FlowDirection => (ids.indexOf(to) < ids.indexOf(from) ? 'back' : 'forward')

/** "Step 2 of 4, Shipping", what the polite region says on arrival. */
export const stepAnnouncement = (ids: readonly string[], id: string, label?: string) => `Step ${ids.indexOf(id) + 1} of ${ids.length}${label ? `, ${label}` : ''}`

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
  const section = (id: string) => [...el.children].find(c => (c as HTMLElement).dataset.part === 'step' && (c as HTMLElement).dataset.step === id) as HTMLElement | undefined

  function leave(step: HTMLElement) {
    step.dataset.state = 'leaving'
    const end = () => { if (live && step.dataset.state === 'leaving') delete step.dataset.state }
    const running = step.getAnimations?.() ?? []
    if (running.length) void Promise.allSettled(running.map(a => a.finished)).then(end)
    else end()
  }

  function arrive(from: string, to: string, push: boolean) {
    el.dataset.dir = flowDirection(o.steps, from, to) === 'back' ? 'back' : 'forward'
    for (const s of el.querySelectorAll<HTMLElement>(':scope > [data-part="step"][data-state="leaving"]')) delete s.dataset.state
    const old = section(from), next = section(to)
    next?.toggleAttribute('data-after-exit', !!old)
    if (old && old !== next) leave(old)
    const target = next?.querySelector<HTMLElement>('[data-autofocus]') ?? next?.querySelector<HTMLElement>(STEP_TITLE)
    target?.focus({ preventScroll: true })
    if (o.announce !== false) announce(doc, stepAnnouncement(o.steps, to, o.label(to)))
    if (push && o.history) win.history.pushState(win.history.state, '', stepUrl(win.location.href, o.history, to))
  }

  function moved(to: string, push: boolean) {
    const from = at
    if (from === to) return
    at = to
    // after the render that moved data-state="active": the effect that fed `update` runs in the same flush
    queueMicrotask(() => { if (live && at === to) arrive(from, to, push) })
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
    if (named && named !== at) { moved(named, false); o.onStep(named) }
    else if (!named) win.history.replaceState(win.history.state, '', stepUrl(win.location.href, o.history, at))
  }
  return {
    update(next: StepFlowOptions) { o = next; moved(o.step, true) },
    destroy() { live = false; win.removeEventListener('popstate', onPop) },
  }
}

// ---- error mapping (09 §1.3): one message per cause -----------------------------------------------------------------

/** Where an error shows: by a field, in an alert, as a rate-limit countdown, a toast or a banner. */
export type FlowSurface = 'field' | 'alert' | 'rate-limit' | 'toast' | 'banner'

/** One error, mapped to the one place it shows and what it says. */
export interface FlowError {
  surface: FlowSurface
  code?: string | undefined
  title: string
  description?: string | undefined
  /** By field name, for `surface: 'field'`. */
  fields: Record<string, string>
  /** "2 fields need attention", said on submit. */
  summary?: string
  /** Where focus goes. */
  focus: 'field' | 'alert' | 'stay'
  /** The live region it goes to; `undefined`: none. */
  live?: 'polite' | 'assertive' | undefined
  retryAfter?: number | undefined
  until?: string | undefined
  attemptsLeft?: number | undefined
}

/** What a server sends with an error, past the code: the fields mapFlowError reads, and whatever a domain adds. */
export type FlowData = { until?: string; retryAfter?: number; attemptsLeft?: number } & Record<string, unknown>

interface IssueLike { message: string; path?: readonly (PropertyKey | { readonly key: PropertyKey })[] }

/** What `mapFlowError` needs beyond the error itself. */
export interface FlowErrorOptions {
  /** `online().value`: a failed submit while offline is a Banner, not a server error. */
  online?: boolean
  /** Copy by code, for a domain error the table doesn't know. */
  copy?: Record<string, string | ((data: FlowData) => string)>
}

/** Field name by field name from Zod or Standard Schema issues: `a.b`, and the first message wins. */
export function issueFields(issues: readonly IssueLike[] = []) {
  const fields: Record<string, string> = {}
  for (const i of issues) {
    const name = (i.path ?? []).map(p => String(typeof p === 'object' && p !== null ? p.key : p)).join('.')
    if (name) fields[name] ??= i.message
  }
  return fields
}

/** "2 fields need attention": the line said on submit. */
export const fieldSummary = (n: number) => (n === 1 ? '1 field needs attention' : `${n} fields need attention`)

const utc = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}
const tries = (n: number | undefined) => (n === undefined ? '' : n === 1 ? ' 1 try left.' : ` ${n} tries left.`)

/** One message per cause: what happened and what to do, in one sentence. Takes a `FnError`, anything like one, or a string. */
export function mapFlowError(error: unknown, { online = true, copy = {} }: FlowErrorOptions = {}): FlowError {
  const e = (typeof error === 'string' ? { message: error } : (error ?? {})) as { code?: string; status?: number; message?: string; issues?: readonly IssueLike[]; data?: FlowData; extra?: FlowData; name?: string }
  const data: FlowData = e.data ?? e.extra ?? e
  const base = { code: e.code, fields: {} as Record<string, string> }
  const alert = (title: string, description?: string): FlowError => ({ ...base, surface: 'alert', title, description, focus: 'alert', live: 'assertive' })
  const fields = issueFields(e.issues)
  const named = Object.keys(fields).length
  if (named) return { ...base, surface: 'field', fields, title: e.message ?? fieldSummary(named), summary: fieldSummary(named), focus: 'field', live: 'polite' }
  const known = e.code ? copy[e.code] : undefined
  if (known) return alert(typeof known === 'function' ? known(data) : known)
  switch (e.code) {
    case 'INVALID_CREDENTIALS': return alert("That email and password don't match.", 'Try again, or reset your password.')
    case 'LOCKED': return { ...alert(`This account is locked${data.until ? ` until ${utc(data.until)}` : ''}.`, 'Reset your password to get back in sooner.'), until: data.until }
    case 'RATE_LIMITED': return { ...base, surface: 'rate-limit', title: 'Too many tries.', retryAfter: data.retryAfter, focus: 'stay', live: 'polite' }
    case 'WRONG_CODE': return { ...base, surface: 'field', fields: { code: `That code didn't work.${tries(data.attemptsLeft)}` }, title: `That code didn't work.${tries(data.attemptsLeft)}`, attemptsLeft: data.attemptsLeft, focus: 'field', live: 'assertive' }
    case 'EXPIRED': return { ...base, surface: 'field', fields: { code: 'That code expired. We sent a new one.' }, title: 'That code expired. We sent a new one.', focus: 'field', live: 'assertive' }
    case undefined:
    default: break
  }
  if (e.code === 'STALE_SCHEMA' || e.code === 'CONTRACT_CHANGED') return { ...base, surface: 'banner', title: 'A new version is ready.', description: 'Reload to finish saving.', focus: 'stay', live: 'polite' }
  if (!online) return { ...base, surface: 'banner', title: "You're offline.", description: 'Your changes are kept. Try again when you reconnect.', focus: 'stay', live: 'assertive' }
  if (e.name === 'TypeError' || (e.status !== undefined && (e.status === 0 || e.status >= 500))) return { ...base, surface: 'toast', title: "We couldn't reach the server.", description: 'Your changes are kept. Try again.', focus: 'stay', live: 'assertive' }
  return alert(e.message || 'That didn\'t go through. Try again.')
}

/** Ticks once a second until zero, from the clock, so a throttled tab catches up. Countdowns are information: reduced motion keeps them. */
export function secondsClock(seconds: number, onTick: (left: number) => void, onDone?: () => void) {
  const end = Date.now() + seconds * 1000
  const id = setInterval(() => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
    onTick(left)
    if (left === 0) { clearInterval(id); onDone?.() }
  }, 1000)
  return () => clearInterval(id)
}

/** `0:30`. */
export const clockLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Cancelling the OS sheet is not an error (09 §2.1): nothing shows. */
export const isPasskeyCancel = (e: unknown) => ['NotAllowedError', 'AbortError'].includes((e as { name?: string } | null)?.name ?? '')

/** Copy to the clipboard; a refusal stays quiet (the text is on the page to select). */
export async function copyText(doc: Document, text: string) {
  try { await doc.defaultView?.navigator.clipboard?.writeText(text); return true } catch { return false }
}

// ---- email and password (09 §2.3) -----------------------------------------------------------------------------------

/** A loose shape check for an email address: something, `@`, a domain with a dot. The server is the real check. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/** The format message on blur: never "Invalid input". Empty says nothing until submit. */
export const emailError = (v: string) => (v && !isEmail(v) ? "That doesn't look like an email. Check for a typo." : undefined)

/** One line of the password checklist. */
export interface PasswordRule { id: string; label: string; met: boolean }

/** The checklist shown under a new password, each rule with whether `v` meets it. */
export const passwordRules = (v: string): PasswordRule[] => [
  { id: 'length', label: 'At least 8 characters', met: v.length >= 8 },
  { id: 'letter', label: 'One letter', met: /\p{L}/u.test(v) },
  { id: 'number', label: 'One number', met: /\d/.test(v) },
]

/** `passwordStrength`'s answer: a score from 0 to 4, its word and its tone. */
export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; tone: 'critical' | 'caution' | 'positive' }

const STRENGTH = [['Too short', 'critical'], ['Weak', 'critical'], ['Fair', 'caution'], ['Good', 'positive'], ['Strong', 'positive']] as const

/** A rough score: length and variety, with a repeated run or a too-short password held down. */
export function passwordStrength(v: string): PasswordStrength {
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter(r => r.test(v)).length
  let score = v.length < 8 ? 0 : Math.min(4, kinds - 1 + (v.length >= 12 ? 1 : 0) + (v.length >= 16 ? 1 : 0))
  if (v.length >= 8) score = Math.max(1, score)
  if (/^(.)\1+$/.test(v)) score = Math.min(score, 1)
  const [label, tone] = STRENGTH[score]!
  return { score: score as PasswordStrength['score'], label, tone }
}

// ---- OTP (03 §3, 09 §2.3): one input, painted cells ----------------------------------------------------------------

/** Digits only, cut to `length`: what a pasted or typed code becomes. */
export const otpClean = (v: string, length: number) => v.replace(/\D/g, '').slice(0, length)

/** Options for the OTP input action. */
export interface OtpOptions {
  length: number
  invalid: boolean
  success: boolean
  onValue(code: string): void
  onComplete(code: string): void
}

/**
 * `[data-scope="otp"]`: paints the one real input into its cells, holds the active cell's sweep, takes a pasted code
 * whatever its spacing. A wrong code pins every cell critical, clears the input and returns focus to it; an accepted
 * one pins them all so the positive sweep cascades.
 */
export function otpInput(el: HTMLElement, opts: OtpOptions) {
  let o = opts
  const input = el.querySelector<HTMLInputElement>(':scope > input')!
  const cells = [...el.querySelectorAll<HTMLElement>('[data-part="cell"]')]
  const doc = el.ownerDocument
  const m = installSweep(doc)
  const paint = () => {
    const v = input.value = otpClean(input.value, o.length)
    const at = Math.min(v.length, o.length - 1), focused = doc.activeElement === input
    cells.forEach((c, i) => {
      c.querySelector('[data-part="char"]')!.textContent = v[i] ?? ''
      m.pin(c, o.invalid || o.success || (focused && i === at))
    })
    return v
  }
  const changed = () => {
    const v = paint()
    o.onValue(v)
    if (v.length === o.length) o.onComplete(v)
  }
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (text === undefined) return
    e.preventDefault()
    input.value = otpClean(text, o.length)
    input.setSelectionRange?.(input.value.length, input.value.length)
    changed()
  }
  const passive = ['focus', 'blur', 'keyup', 'click', 'select']
  input.addEventListener('input', changed)
  input.addEventListener('paste', onPaste)
  for (const t of passive) input.addEventListener(t, paint)
  paint()
  return {
    update(next: OtpOptions) {
      const wrong = next.invalid && !o.invalid, won = next.success && !o.success
      o = next
      if (wrong) { input.value = ''; o.onValue(''); input.focus({ preventScroll: true }) }
      if (won) input.blur()
      paint()
    },
    destroy() {
      input.removeEventListener('input', changed)
      input.removeEventListener('paste', onPaste)
      for (const t of passive) input.removeEventListener(t, paint)
    },
  }
}

// ---- tour (09 §3.2) ------------------------------------------------------------------------------------------------

/** A rectangle in viewport pixels: the tour's target or its card. */
export interface TourBox { x: number; y: number; w: number; h: number }

/** Where the card goes: beside the target with a flip; on a phone, docked to the edge away from it. */
export function tourPlacement(target: TourBox, card: { w: number; h: number }, view: { w: number; h: number }): { left: number; top: number; width?: number } {
  if (view.w < 600) return { left: 12, width: view.w - 24, top: target.y + target.h / 2 > view.h / 2 ? 12 : view.h - card.h - 12 }
  if (target.x + target.w + card.w + 24 < view.w && target.x < view.w * 0.3)
    return { left: target.x + target.w + 14, top: Math.min(Math.max(12, target.y + target.h / 2 - card.h / 2), view.h - card.h - 12) }
  const left = Math.min(Math.max(12, target.x + target.w - card.w), view.w - card.w - 12)
  const below = target.y + target.h + 14
  return { left, top: below + card.h > view.h - 12 ? Math.max(12, target.y - card.h - 14) : below }
}

const CARD_FOCUS = 'button:not(:disabled):not([hidden]), a[href], input:not(:disabled), [tabindex="0"]'

/** Prefer an element that is on screen: a target can exist twice, in a hidden layout. */
function findTarget(doc: Document, selector: string) {
  const all = [...doc.querySelectorAll<HTMLElement>(selector)]
  return all.find(t => t.getClientRects().length) ?? all[0] ?? null
}

/** Options for the tour spotlight action. */
export interface TourSpotOptions {
  /** The step's target selector. */
  target: string
  /** The step number: the same target can come twice. */
  step: number
  /** The target stays pressable ("Try it: click New"); otherwise the scrim blocks every press. */
  interactive?: boolean | undefined
  onNext(): void
  onPrev(): void
  onClose(): void
  /** The target isn't in the page: skip this step. */
  onMissing(): void
  /** Started over another overlay: never run. */
  onBlocked(): void
}

/**
 * `[data-scope="tour"]`, mounted while a tour runs: places the spotlight and the card, draws the ring on arrival, scrolls
 * the target in, describes it by the card, keeps Tab in the card, blocks presses outside it, ends on Escape and returns
 * focus to where the tour began. `<dialog open>` anywhere stops it before it starts.
 */
export function tourSpot(root: HTMLElement, opts: TourSpotOptions) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const opener = doc.activeElement as HTMLElement | null
  const spot = root.querySelector<HTMLElement>('[data-part="spotlight"]')!
  const card = root.querySelector<HTMLElement>('[data-part="card"]')!
  const m = installSweep(doc)
  let target: HTMLElement | null = null
  let described: string | null = null
  let off = false
  // anchor()'s precedent: the layer is viewport-sized wherever the app mounts it
  root.style.setProperty('position', 'fixed')

  const describe = (t: HTMLElement | null) => {
    if (target) {
      if (described === null) target.removeAttribute('aria-describedby')
      else target.setAttribute('aria-describedby', described)
    }
    target = t
    if (t) {
      described = t.getAttribute('aria-describedby')
      t.setAttribute('aria-describedby', [described, card.getAttribute('aria-describedby')].filter(Boolean).join(' '))
    }
  }
  function place() {
    if (!target?.isConnected) return
    const r = target.getBoundingClientRect()
    const box = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 }
    spot.style.left = `${box.x}px`; spot.style.top = `${box.y}px`; spot.style.width = `${box.w}px`; spot.style.height = `${box.h}px`
    const p = tourPlacement(box, { w: card.offsetWidth || 300, h: card.offsetHeight || 170 }, { w: win.innerWidth, h: win.innerHeight })
    card.style.left = `${p.left}px`; card.style.top = `${p.top}px`; card.style.width = p.width ? `${p.width}px` : ''
  }
  function arrive() {
    if (off) return
    const t = findTarget(doc, o.target)
    if (!t) return o.onMissing()
    describe(t)
    const instant = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || doc.documentElement.dataset.motion === 'reduce'
    t.scrollIntoView?.({ block: 'center', behavior: instant ? 'instant' : 'smooth' })
    place()
    spot.dataset.phase = 'idle'
    void spot.offsetWidth // redraw L→R on each step
    m.sync(spot)
    card.querySelector<HTMLElement>('h4, h3, h2')?.focus({ preventScroll: true })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') return o.onNext()
    if (e.key === 'ArrowLeft') return o.onPrev()
    if (e.key !== 'Tab') return
    const all = [...card.querySelectorAll<HTMLElement>(CARD_FOCUS)]
    const at = all.indexOf(doc.activeElement as HTMLElement)
    e.preventDefault()
    all[e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length]?.focus()
  }
  const block = (e: Event) => {
    const t = e.target as Node
    if (card.contains(t) || (o.interactive && target?.contains(t))) return
    e.preventDefault()
    e.stopPropagation()
  }
  if (doc.querySelector('dialog[open]')) {
    off = true
    queueMicrotask(() => o.onBlocked())
    return { update(next: TourSpotOptions) { o = next }, destroy() {} }
  }
  const remove = pushLayer({ el: card, modal: true, close: () => o.onClose() })
  card.addEventListener('keydown', onKey)
  for (const t of ['pointerdown', 'mousedown', 'click']) doc.addEventListener(t, block, true)
  win.addEventListener('scroll', place, true)
  win.addEventListener('resize', place)
  arrive()
  return {
    update(next: TourSpotOptions) {
      const moved = next.step !== o.step
      o = next
      if (moved) queueMicrotask(arrive)
    },
    destroy() {
      off = true
      remove()
      describe(null)
      card.removeEventListener('keydown', onKey)
      for (const t of ['pointerdown', 'mousedown', 'click']) doc.removeEventListener(t, block, true)
      win.removeEventListener('scroll', place, true)
      win.removeEventListener('resize', place)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    },
  }
}

/** A coachmark's layer: no scrim; the beacon sits on the target's corner and the card by it. */
export function coachSpot(root: HTMLElement, opts: { target: string; open: boolean; onClose(): void }) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const beacon = root.querySelector<HTMLElement>('[data-beacon]')!
  let remove: (() => void) | undefined
  root.style.setProperty('position', 'fixed')
  beacon.style.setProperty('position', 'absolute')
  beacon.style.setProperty('pointer-events', 'auto')
  function place() {
    const t = findTarget(doc, o.target)
    beacon.hidden = !t
    if (!t) return
    const r = t.getBoundingClientRect()
    beacon.style.left = `${r.right - 16}px`
    beacon.style.top = `${r.top - 8}px`
    const card = root.querySelector<HTMLElement>('[data-part="card"]')
    if (!card) return
    const p = tourPlacement({ x: r.left, y: r.top, w: r.width, h: r.height }, { w: card.offsetWidth || 300, h: card.offsetHeight || 170 }, { w: win.innerWidth, h: win.innerHeight })
    card.style.left = `${p.left}px`; card.style.top = `${p.top}px`; card.style.width = p.width ? `${p.width}px` : ''
  }
  function sync() {
    remove?.()
    remove = undefined
    place()
    if (!o.open) return
    const card = root.querySelector<HTMLElement>('[data-part="card"]')
    if (!card) return
    remove = pushLayer({ el: card, trigger: beacon, close: () => o.onClose() })
    card.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true })
  }
  win.addEventListener('scroll', place, true)
  win.addEventListener('resize', place)
  sync()
  return {
    update(next: typeof opts) {
      const closed = o.open && !next.open
      o = next
      queueMicrotask(sync)
      if (closed) beacon.focus({ preventScroll: true })
    },
    destroy() {
      remove?.()
      win.removeEventListener('scroll', place, true)
      win.removeEventListener('resize', place)
    },
  }
}

// ---- connection (09 §5.3, §5.4) -------------------------------------------------------------------------------------

/** What the connection banner shows; `undefined`: nothing. */
export type ConnView = 'offline' | 'reconnecting' | 'online' | 'stale' | undefined

/** What the banner shows: offline over reconnecting over a stale deploy; `recovered` is the short "Back online". */
export function connView({ online, state, stale, recovered }: { online: boolean; state?: string | undefined; stale?: boolean | undefined; recovered?: boolean | undefined }): ConnView {
  if (!online || state === 'offline') return 'offline'
  if (state === 'reconnecting' || state === 'connecting') return 'reconnecting'
  if (recovered) return 'online'
  return stale ? 'stale' : undefined
}

// ---- keyboard shortcuts (09 §7) -------------------------------------------------------------------------------------

/** One keyboard shortcut in the registry. */
export interface Shortcut {
  /** Space-separated steps, `+` within one: `?`, `g m`, `mod+k`. `mod` is ⌘ on Apple platforms and Ctrl elsewhere. */
  keys: string
  label: string
  group?: string
  /** Only while this holds (and the overlay lists it only then). */
  when?: () => boolean
  run?: (e: KeyboardEvent) => void
}

const NAMES: Record<string, string> = { esc: 'Escape', escape: 'Escape', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', enter: 'Enter', space: ' ' }
const GLYPHS: Record<string, string> = { esc: 'Esc', escape: 'Esc', left: '←', right: '→', up: '↑', down: '↓', enter: 'Enter', space: 'Space', shift: 'Shift' }
const SEQUENCE_MS = 1000

const MODS = new Set(['mod', 'ctrl', 'cmd', 'alt', 'shift'])
const parts = (step: string) => (step === '+' ? ['+'] : step.split('+'))

/** Whether `mod` means ⌘: an Apple platform, from the navigator. */
export const isApple = (nav: { platform?: string; userAgent?: string } | undefined) => /mac|iphone|ipad|ipod/i.test(nav?.platform ?? nav?.userAgent ?? '')

/** The chips for each step: `[['⌘', 'K']]`, or `[['Ctrl', 'K']]`, `[['G'], ['M']]`. */
export function shortcutLabels(keys: string, apple: boolean) {
  return keys.trim().split(/\s+/).map(step => parts(step).map(p => {
    const k = p.toLowerCase()
    if (k === 'mod' || k === 'cmd') return apple ? '⌘' : 'Ctrl'
    if (k === 'ctrl') return 'Ctrl'
    if (k === 'alt') return apple ? '⌥' : 'Alt'
    return GLYPHS[k] ?? p.toUpperCase()
  }))
}

/** A single-key shortcut has no ⌘, Ctrl or Alt: WCAG 2.1.4 lets the user turn these off. */
export const isSingleKey = (keys: string) => !keys.split(/\s+/).some(s => parts(s).some(p => ['mod', 'ctrl', 'cmd', 'alt'].includes(p.toLowerCase())))

/** A field that takes typing: a single-key shortcut never fires there. */
export function isTextTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el?.tagName) return false
  if (el.isContentEditable || el.closest?.('[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !/^(button|checkbox|color|file|image|radio|range|reset|submit)$/i.test((el as HTMLInputElement).type)
}

function matches(step: string, e: KeyboardEvent, apple: boolean) {
  const list = parts(step)
  const key = list.find(p => !MODS.has(p.toLowerCase())) ?? ''
  const want = list.map(p => p.toLowerCase())
  const mod = want.includes('mod')
  const named = NAMES[key.toLowerCase()]
  const hit = named ? e.key === named : e.key.toLowerCase() === key.toLowerCase()
  // a symbol's shift is part of the key: `?` is Shift+/ on one layout and something else on another
  const shiftCounts = want.includes('shift') || /^[a-z0-9]$/i.test(key) || !!named
  return hit
    && e.metaKey === (want.includes('cmd') || (mod && apple))
    && e.ctrlKey === (want.includes('ctrl') || (mod && !apple))
    && e.altKey === want.includes('alt')
    && (!shiftCounts || e.shiftKey === want.includes('shift'))
}

/** A registry of shortcuts, so the overlay is always true. Most apps use the shared `shortcuts`. */
export function createShortcuts() {
  const list = new Set<Shortcut>()
  const subs = new Set<() => void>()
  const docs = new Map<Document, { n: number; stop(): void }>()
  let singleKeys = true
  const notify = () => subs.forEach(s => s())

  function listener(doc: Document) {
    let held: { steps: string[]; s: Shortcut }[] = []
    let heldAt = 0
    return (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return
      const apple = isApple(doc.defaultView?.navigator)
      const live = [...list].filter(s => !s.when || s.when())
      const open = (s: Shortcut) => (!isSingleKey(s.keys) || (singleKeys && !isTextTarget(e.target)))
      const pending = e.timeStamp - heldAt < SEQUENCE_MS ? held : []
      const next = pending.filter(h => matches(h.steps[0] ?? '', e, apple)).map(h => ({ ...h, steps: h.steps.slice(1) }))
      const start = live.filter(open).map(s => ({ s, steps: s.keys.trim().split(/\s+/) }))  .filter(h => matches(h.steps[0] ?? '', e, apple)).map(h => ({ ...h, steps: h.steps.slice(1) }))
      const hits = [...next, ...start]
      const done = hits.find(h => !h.steps.length)
      held = done ? [] : hits
      heldAt = e.timeStamp
      if (done?.s.run) { e.preventDefault(); done.s.run(e) }
    }
  }

  return {
    /** Add a shortcut; the returned function removes it. */
    register(s: Shortcut) {
      list.add(s)
      notify()
      return () => { list.delete(s); notify() }
    },
    /** Everything registered now, in order, `when` applied. */
    list: () => [...list].filter(s => !s.when || s.when()),
    /** Called when the list or the setting changes. */
    subscribe(fn: () => void) { subs.add(fn); return () => void subs.delete(fn) },
    /** Whether single-key shortcuts fire. */
    get singleKeys() { return singleKeys },
    set singleKeys(on: boolean) { singleKeys = on; notify() },
    /** Start listening on a document; the returned function stops. Shared between callers. */
    listen(doc: Document) {
      let d = docs.get(doc)
      if (!d) {
        const fn = listener(doc)
        doc.addEventListener('keydown', fn)
        d = { n: 0, stop: () => doc.removeEventListener('keydown', fn) }
        docs.set(doc, d)
      }
      d.n++
      const entry = d
      return () => { if (--entry.n === 0) { entry.stop(); docs.delete(doc) } }
    },
  }
}
/** A shortcuts registry, as `createShortcuts` makes it. */
export type Shortcuts = ReturnType<typeof createShortcuts>

/** The app's one registry: `shortcuts.register({ keys, label, group, when, run })`. */
export const shortcuts = /* @__PURE__ */ createShortcuts()

/** Shortcuts whose name or keys hold `query`. */
export function filterShortcuts<S extends Shortcut>(list: readonly S[], query: string, apple: boolean) {
  const q = query.trim().toLowerCase()
  if (!q) return [...list]
  return list.filter(s => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q) || shortcutLabels(s.keys, apple).flat().join(' ').toLowerCase().includes(q))
}

/** `text` split around `query`, for `<mark>`. */
export function markParts(text: string, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return [{ at: 0, text, hit: false }]
  const out: { at: number; text: string; hit: boolean }[] = []
  const low = text.toLowerCase()
  let at = 0
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, at)) {
    if (i > at) out.push({ at, text: text.slice(at, i), hit: false })
    out.push({ at: i, text: text.slice(i, i + q.length), hit: true })
    at = i + q.length
  }
  if (at < text.length) out.push({ at, text: text.slice(at), hit: false })
  return out
}
