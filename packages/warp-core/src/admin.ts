// The warp-core half of the admin pack (09 §4, §6): pure logic and actions, no framework.
import { addressFormat, addressPart, type Address, type AddressPart } from './identity'

/* ---- text and money ---- */

export const adminEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** An https endpoint with a host that has a dot (09 §4.6). */
export const httpsEndpoint = (s: string) => /^https:\/\/[^\s/.]+\.[^\s]+$/.test(s.trim())

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function money(n: number, currency = 'USD', locale = 'en-US') {
  const cents = Math.round(n * 100) / 100
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: Number.isInteger(cents) ? 0 : 2, maximumFractionDigits: 2 }).format(cents)
}

/** "4 min ago", "2 h ago", "3 d ago" from two instants; `now` is a prop, never the clock, so SSR and hydration agree. */
export function agoText(iso: string, now: string) {
  const min = Math.round((Date.parse(now) - Date.parse(iso)) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} d ago`
}

export const usedWithinDay = (iso: string | undefined, now: string) => !!iso && Date.parse(now) - Date.parse(iso) < 864e5

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
  return [...new Set([...Object.keys(base), ...Object.keys(now)])].filter(k => !same(base[k], now[k]))
}

export interface LeaveGuardOptions { dirty: boolean; onAttempt: (href: string) => void }

/**
 * Asks before leaving a dirty form: the browser's own prompt on unload, and `onAttempt` for a same-document link press
 * outside `el`'s own page anchors. Fragment links stay on the page, so they pass.
 */
export function leaveGuard(el: Element, opts: LeaveGuardOptions) {
  let o = opts
  const doc = el.ownerDocument
  const unload = (e: BeforeUnloadEvent) => { if (o.dirty) e.preventDefault() }
  const click = (e: MouseEvent) => {
    if (!o.dirty || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey) return
    const a = (e.target as Element).closest?.('a[href]')
    const href = a?.getAttribute('href')
    if (!href || href.startsWith('#') || a!.hasAttribute('download') || a!.getAttribute('target') === '_blank') return
    e.preventDefault()
    o.onAttempt(href)
  }
  doc.defaultView?.addEventListener('beforeunload', unload)
  doc.addEventListener('click', click, true)
  return {
    update(next: LeaveGuardOptions) { o = next },
    destroy() { doc.defaultView?.removeEventListener('beforeunload', unload); doc.removeEventListener('click', click, true) },
  }
}

/* ---- members and invites (09 §4.2) ---- */

export const isLastOwner = <M extends { role: string; id: string }>(members: readonly M[], m: M, owner = 'owner') =>
  m.role === owner && members.filter(x => x.role === owner).length === 1

/** Comma, semicolon or whitespace separated; what a paste or Enter hands to a tags field. Empty and repeated go. */
export function addTags(list: readonly string[], raw: string) {
  const fresh = [...new Set(raw.split(/[\s,;]+/).filter(Boolean))].filter(t => !list.includes(t))
  return { list: [...list, ...fresh], added: fresh }
}

/** The one message for an invite that can't go, or undefined (bad addresses first, then seats). */
export function inviteProblem(emails: readonly string[], seatsLeft: number) {
  if (!emails.length) return 'Add at least one email address.'
  const bad = emails.filter(e => !adminEmail(e))
  if (bad.length) return bad.length === 1 ? `“${bad[0]}” isn't a valid email. Remove or fix it.` : `${bad.length} addresses aren't valid emails. Remove or fix them.`
  if (emails.length > seatsLeft) return `You have ${plural(seatsLeft, 'seat')} left. Remove ${emails.length - seatsLeft}, or add seats in Billing.`
  return undefined
}

/* ---- usage meters (09 §4.3) ---- */

export interface MeterParts { tone?: 'caution' | 'critical' | undefined; percent: number; fill: number; over: number; warn: number }

/** Neutral under 80%, caution from 80%, critical at 100%; past the limit the rail rescales so the overage shows as stripes. */
export function meterParts(value: number, limit: number): MeterParts {
  const p = limit > 0 ? value / limit : 0
  const scale = Math.max(1, p)
  return { tone: p >= 1 ? 'critical' : p >= 0.8 ? 'caution' : undefined, percent: Math.round(p * 100), fill: (Math.min(1, p) / scale) * 100, over: p > 1 ? ((p - 1) / p) * 100 : 0, warn: 80 / scale }
}

/* ---- plans and proration (09 §4.3) ---- */

export type BillingInterval = 'month' | 'year'
export interface ProrationLine { label: string; amount: number }
export interface Proration { lines: ProrationLine[]; total: number; due: 'today' | 'next' }

export const planPrice = (monthly: number, interval: BillingInterval, annualOff = 0.2) => (interval === 'year' ? Math.round(monthly * (1 - annualOff)) : monthly)

/** The default preview: pay the difference for the days left on an upgrade; a downgrade waits for the next period. */
export function prorate(o: { from: { name: string; price: number }; to: { name: string; price: number }; seats: number; daysLeft: number; periodDays: number }): Proration {
  const { from, to, seats, daysLeft, periodDays } = o
  const part = daysLeft / periodDays
  const credit = from.price * seats * part
  const next = to.price * seats
  const lines = [{ label: `${to.name}, ${plural(seats, 'seat')} × ${to.price}`, amount: next }, { label: `Credit for unused ${from.name} time`, amount: -credit }]
  return to.price > from.price ? { lines, total: Math.max(0, next * part - credit), due: 'today' } : { lines, total: next, due: 'next' }
}

/* ---- CSV import (09 §4.7) ---- */

export interface CsvTable { headers: string[]; rows: string[][]; problem?: string | undefined }
export interface ImportTarget { id: string; label: string; required?: boolean; aliases?: string[]; check?: (value: string) => string | undefined }
export interface ImportIssue { row: number; path: string; message: string }
export const SKIP_COLUMN = 'skip'

export const isCsvFile = (name: string, type = '') => /\.csv$/i.test(name) || type === 'text/csv'

const sniff = (line: string) => {
  const count = (d: string) => line.split(d).length
  return [',', ';', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ',')
}

/**
 * RFC 4180: quoted fields, doubled quotes, line breaks inside quotes, CRLF, a BOM. The delimiter is the one that splits
 * the first line most (comma, semicolon or tab). Blank lines go; a short row pads, so every row has the header's width.
 */
export function parseCsv(input: string, delimiter?: string): CsvTable {
  const text = input.replace(/^﻿/, '')
  const d = delimiter ?? sniff(text.slice(0, text.search(/\r?\n|$/)))
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const endCell = () => { row.push(cell); cell = '' }
  const endRow = () => { endCell(); if (row.some(c => c !== '')) grid.push(row); row = [] }
  while (i < text.length) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue }
      if (c === '"') quoted = false
      else cell += c
      i++
    } else if (c === '"' && cell === '') { quoted = true; i++ }
    else if (c === d) { endCell(); i++ }
    else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) { endRow(); i += c === '\r' ? 2 : 1 }
    else { cell += c; i++ }
  }
  const open = quoted
  if (cell !== '' || row.length) endRow()
  const [headers = [], ...rest] = grid
  const names = headers.map(h => h.trim())
  return { headers: names, rows: rest.map(r => names.map((_, at) => (r[at] ?? '').trim())), problem: open ? 'A quote in this file never closes.' : !names.length ? 'This file is empty.' : undefined }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Columns pre-mapped by header name or alias; each target takes the first column that claims it; the rest skip. */
export function autoMap(headers: readonly string[], targets: readonly ImportTarget[]) {
  const taken = new Set<string>()
  return headers.map(h => {
    const key = norm(h)
    const t = targets.find(x => !taken.has(x.id) && [x.id, x.label, ...(x.aliases ?? [])].some(n => norm(n) === key))
    if (t) taken.add(t.id)
    return t?.id ?? SKIP_COLUMN
  })
}

/** The required targets no column maps to: reported once, not per row. */
export const missingTargets = (map: readonly string[], targets: readonly ImportTarget[]) => targets.filter(t => t.required && !map.includes(t.id))

/** Every cell's problem, same shape as the server's `{ row, path, message }[]`, so the preview and the import can't disagree. */
export function checkImport(rows: readonly string[][], map: readonly string[], targets: readonly ImportTarget[]) {
  const issues: ImportIssue[] = []
  rows.forEach((r, row) => map.forEach((id, col) => {
    const t = targets.find(x => x.id === id)
    if (!t) return
    const v = r[col] ?? ''
    const message = !v && t.required ? `${t.label} is required` : v ? t.check?.(v) : undefined
    if (message) issues.push({ row, path: id, message })
  }))
  return issues
}

export const badRows = (issues: readonly ImportIssue[]) => new Set(issues.map(i => i.row)).size

/** The good rows as records keyed by target; skipped columns go. */
export function importRecords(rows: readonly string[][], map: readonly string[], issues: readonly ImportIssue[]) {
  const bad = new Set(issues.map(i => i.row))
  return rows.filter((_, i) => !bad.has(i)).map(r => Object.fromEntries(map.flatMap((id, col) => (id === SKIP_COLUMN ? [] : [[id, r[col] ?? '']]))) as Record<string, string>)
}

/* ---- commerce (09 §6) ---- */

export interface CartLine { id: string; name: string; variant?: string; price: number; quantity: number; art?: string }
export interface CartTotals { subtotal: number; discount: number; shipping: number; tax: number; total: number }

export const cartCount = (lines: readonly CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0)

export function cartTotals(lines: readonly CartLine[], o: { shipping?: number; percentOff?: number; taxRate?: number } = {}): CartTotals {
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
    else if (part === 'postalCode' && v && f.postal && !f.postal.test(v)) out[part] = f.postalMessage!
  }
  return out
}

export type CheckoutError = { code: 'CARD_DECLINED'; reason: string } | { code: 'OUT_OF_STOCK'; sku: string } | { code: 'PRICE_CHANGED'; total: number }

/** Which step a typed order error returns to (09 §6.2). */
export const errorStep = (e: CheckoutError) => (e.code === 'CARD_DECLINED' ? 'payment' : e.code === 'OUT_OF_STOCK' ? 'cart' : 'review')

/** A client key for one attempt at an order: a retry resends it, a definite refusal takes a new one. */
export const newOrderKey = () => globalThis.crypto.randomUUID()

/** Opens a `<details>` while its host is at least `from` wide (the sticky summary column), and shuts it below. */
export function openWhenWide(el: HTMLDetailsElement, from: number) {
  const host = el.parentElement!
  const fit = () => { el.open = host.clientWidth >= from }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined
  ro?.observe(host)
  fit()
  return { update() {}, destroy() { ro?.disconnect() } }
}
