// The veneer-core half of the admin pack (09 §4, §6): pure logic and actions, no framework.
import { addressFormat, addressPart, type Address, type AddressPart } from './identity'

/* ---- text and money ---- */

/** Whether `s` is shaped like an email address; the server still has the last word. */
export const adminEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** An https endpoint with a host that has a dot (09 §4.6). */
export const httpsEndpoint = (s: string) => /^https:\/\/[^\s/.]+\.[^\s]+$/.test(s.trim())

/** `n` with its noun, singular or plural. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** An amount in `currency`, formatted for `locale`. */
export function money(n: number, currency = 'USD', locale = 'en-US') {
  const cents = Math.round(n * 100) / 100
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(cents) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents)
}

/** "4 min ago", "2 h ago", "3 d ago" from two instants; `now` is a prop, never the clock, so SSR and hydration agree. */
export function agoText(iso: string, now: string) {
  const min = Math.round((Date.parse(now) - Date.parse(iso)) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} d ago`
}

/** Whether `iso` falls within the 24 hours before `now`. */
export const usedWithinDay = (iso: string | undefined, now: string) =>
  !!iso && Date.parse(now) - Date.parse(iso) < 864e5

/** Type-to-confirm (09 §4.4): the text matches exactly, surrounding space forgiven. */
export const confirmMatches = (typed: string, expected: string) => typed.trim() === expected

/* ---- dirty diff and the leave guard (09 §4.1) ---- */

const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The keys that differ between a snapshot and the live values. */
export function dirtyKeys(base: Record<string, unknown>, now: Record<string, unknown>) {
  return [...new Set([...Object.keys(base), ...Object.keys(now)])].filter(
    (k) => !same(base[k], now[k]),
  )
}

/** What the leave guard needs: whether the page is dirty, and who hears an attempted exit. */
export interface LeaveGuardOptions {
  dirty: boolean
  onAttempt: (href: string) => void
}

/**
 * Asks before leaving a dirty form: the browser's own prompt on unload, and `onAttempt` for a same-document link press
 * outside `el`'s own page anchors. Fragment links stay on the page, so they pass.
 */
export function leaveGuard(el: Element, opts: LeaveGuardOptions) {
  let o = opts
  const doc = el.ownerDocument
  const unload = (e: BeforeUnloadEvent) => {
    if (o.dirty) e.preventDefault()
  }
  const click = (e: MouseEvent) => {
    if (!o.dirty || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey) return
    const a = (e.target as Element).closest?.('a[href]')
    const href = a?.getAttribute('href')
    if (
      !href ||
      href.startsWith('#') ||
      a!.hasAttribute('download') ||
      a!.getAttribute('target') === '_blank'
    )
      return
    e.preventDefault()
    o.onAttempt(href)
  }
  doc.defaultView?.addEventListener('beforeunload', unload)
  doc.addEventListener('click', click, true)
  return {
    update(next: LeaveGuardOptions) {
      o = next
    },
    destroy() {
      doc.defaultView?.removeEventListener('beforeunload', unload)
      doc.removeEventListener('click', click, true)
    },
  }
}

/* ---- members and invites (09 §4.2) ---- */

/** Whether `m` is the only owner left, so removing or demoting them would strand the workspace. */
export const isLastOwner = <M extends { role: string; id: string }>(
  members: readonly M[],
  m: M,
  owner = 'owner',
) => m.role === owner && members.filter((x) => x.role === owner).length === 1

/** Comma, semicolon or whitespace separated; what a paste or Enter hands to a tags field. Empty and repeated go. */
export function addTags(list: readonly string[], raw: string) {
  const fresh = [...new Set(raw.split(/[\s,;]+/).filter(Boolean))].filter((t) => !list.includes(t))
  return { list: [...list, ...fresh], added: fresh }
}

/** The one message for an invite that can't go, or undefined (bad addresses first, then seats). */
export function inviteProblem(emails: readonly string[], seatsLeft: number) {
  if (!emails.length) return 'Add at least one email address.'
  const bad = emails.filter((e) => !adminEmail(e))
  if (bad.length)
    return bad.length === 1
      ? `“${bad[0]}” isn't a valid email. Remove or fix it.`
      : `${bad.length} addresses aren't valid emails. Remove or fix them.`
  if (emails.length > seatsLeft)
    return `You have ${plural(seatsLeft, 'seat')} left. Remove ${emails.length - seatsLeft}, or add seats in Billing.`
  return undefined
}

/* ---- usage meters (09 §4.3) ---- */

/** A usage meter worked out: its tone, the percent shown, and the bar's fill, overage and warning marks. */
export interface MeterParts {
  tone?: 'caution' | 'critical' | undefined
  percent: number
  fill: number
  over: number
  warn: number
}

/** Neutral under 80%, caution from 80%, critical at 100%; past the limit the rail rescales so the overage shows as stripes. */
export function meterParts(value: number, limit: number): MeterParts {
  const p = limit > 0 ? value / limit : 0
  const scale = Math.max(1, p)
  return {
    tone: p >= 1 ? 'critical' : p >= 0.8 ? 'caution' : undefined,
    percent: Math.round(p * 100),
    fill: (Math.min(1, p) / scale) * 100,
    over: p > 1 ? ((p - 1) / p) * 100 : 0,
    warn: 80 / scale,
  }
}

/* ---- plans and proration (09 §4.3) ---- */

/** How often a plan bills. */
export type BillingInterval = 'month' | 'year'
/** One charge or credit on a proration. */
export interface ProrationLine {
  label: string
  amount: number
}
/** What a plan change costs: its lines, the total, and whether it's due today or next cycle. */
export interface Proration {
  lines: ProrationLine[]
  total: number
  due: 'today' | 'next'
}

/** The monthly price on `interval`, with the annual discount taken off a yearly plan. */
export const planPrice = (monthly: number, interval: BillingInterval, annualOff = 0.2) =>
  interval === 'year' ? Math.round(monthly * (1 - annualOff)) : monthly

/** The default preview: pay the difference for the days left on an upgrade; a downgrade waits for the next period. */
export function prorate(o: {
  from: { name: string; price: number }
  to: { name: string; price: number }
  seats: number
  daysLeft: number
  periodDays: number
}): Proration {
  const { from, to, seats, daysLeft, periodDays } = o
  const part = daysLeft / periodDays
  const credit = from.price * seats * part
  const next = to.price * seats
  const lines = [
    { label: `${to.name}, ${plural(seats, 'seat')} × ${to.price}`, amount: next },
    { label: `Credit for unused ${from.name} time`, amount: -credit },
  ]
  return to.price > from.price
    ? { lines, total: Math.max(0, next * part - credit), due: 'today' }
    : { lines, total: next, due: 'next' }
}

export {
  SKIP_COLUMN,
  isCsvFile,
  parseCsv,
  autoMap,
  missingTargets,
  checkImport,
  badRows,
  importRecords,
} from './admin-import'
export type { CsvTable, ImportTarget, ImportIssue } from './admin-import'

/* ---- commerce (09 §6) ---- */

/** One line in a cart. */
export interface CartLine {
  id: string
  name: string
  variant?: string
  price: number
  quantity: number
  art?: string
}
/** A cart's money, added up. */
export interface CartTotals {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
}

/** How many items are in the cart, counting quantities. */
export const cartCount = (lines: readonly CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0)

/** The cart's subtotal, discount, shipping, tax and total. */
export function cartTotals(
  lines: readonly CartLine[],
  o: { shipping?: number; percentOff?: number | undefined; taxRate?: number } = {},
): CartTotals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0)
  const discount = subtotal * ((o.percentOff ?? 0) / 100)
  const shipping = o.shipping ?? 0
  const tax = (subtotal - discount) * (o.taxRate ?? 0)
  return { subtotal, discount, shipping, tax, total: subtotal - discount + shipping + tax }
}

/** The address's blanks and bad postal code, by part, for the country it's in. A label with "(optional)" may stay empty. */
export function addressProblems(a: Address | null, country: string) {
  const f = addressFormat(a?.country ?? country)
  const out: Partial<Record<AddressPart, string>> = {}
  for (const [part, label] of f.fields) {
    const v = addressPart(a, part).trim()
    if (!v && !/optional/i.test(label)) out[part] = `Enter a ${label.toLowerCase()}.`
    else if (part === 'postalCode' && v && f.postal && !f.postal.test(v))
      out[part] = f.postalMessage!
  }
  return out
}

/** The ways a checkout can be refused, each with what the UI needs to say so. */
export type CheckoutError =
  | { code: 'CARD_DECLINED'; reason: string }
  | { code: 'OUT_OF_STOCK'; sku: string }
  | { code: 'PRICE_CHANGED'; total: number }

/** Which step a typed order error returns to (09 §6.2). */
export const errorStep = (e: CheckoutError) =>
  e.code === 'CARD_DECLINED' ? 'payment' : e.code === 'OUT_OF_STOCK' ? 'cart' : 'review'

/**
 * A client key for one attempt at an order: a retry resends it, a definite refusal takes a new one.
 * A v4 UUID. A page on plain http (a LAN address) has no `randomUUID`, so it falls back to `getRandomValues`.
 */
export const newOrderKey = (): string => {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Opens a `<details>` while its host is at least `from` wide (the sticky summary column), and shuts it below. */
export function openWhenWide(el: HTMLDetailsElement, from: number) {
  const host = el.parentElement!
  const fit = () => {
    el.open = host.clientWidth >= from
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined
  ro?.observe(host)
  fit()
  return {
    update() {},
    destroy() {
      ro?.disconnect()
    },
  }
}
