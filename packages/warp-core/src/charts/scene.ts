// A chart's SVG as plain data. `toHTML` is what the server renders; `patch` lays a new scene over the nodes already
// there, keeping identity and writing only what changed (06 §1: a data change rewrites `d`, `cx`, `cy` on existing
// nodes, and sort, filter and resize never rebuild marks). A node's identity is its tag, class, series and mark index.

export type Attrs = Record<string, string | number | boolean | null | undefined>
/** An SVG node as plain data: tag, attributes, children. */
export type Scene = { t: string; a: Attrs; c: Child[] }
/** What a scene node holds once tidied: a node or text. */
export type Child = Scene | string
/** What a form may hand a node: falsy entries vanish and nested lists flatten. */
export type Kid = Child | number | boolean | null | undefined | readonly Kid[]
type Tween = { el: Element; name: string; from: number[]; to: number[]; bits: string[]; end: string }

const SVG = 'http://www.w3.org/2000/svg'
const NUMBER = /-?\d*\.?\d+(?:e-?\d+)?/g
const animated = new Set(['d', 'points', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2'])
const runtime = new Set(['tabindex', 'data-active', 'data-series-active'])

export const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const text = (v: string | number | boolean) => (v === true ? '' : typeof v === 'number' ? String(+v.toFixed(2)) : String(v))
const on = (v: unknown): v is string | number | true => v !== null && v !== undefined && v !== false

/** A scene node. Falsy children vanish and nested lists flatten, so a form reads like the markup it writes. */
export function s(t: string, a: Attrs = {}, ...c: Kid[]): Scene {
  return { t, a, c: tidy(c) }
}
const tidy = (c: readonly Kid[]): Child[] => (c.flat(5) as (Child | number | boolean | null | undefined)[]).filter(x => x !== null && x !== undefined && x !== false && x !== '').map(x => (typeof x === 'number' ? String(x) : x as Child))

/** A scene as markup, for the server. */
export function toHTML(nodes: readonly Kid[]): string {
  let out = ''
  for (const n of tidy(nodes)) {
    if (typeof n === 'string') { out += esc(n); continue }
    out += `<${n.t}`
    for (const k in n.a) if (on(n.a[k])) out += ` ${k}="${esc(text(n.a[k]))}"`
    out += `>${toHTML(n.c)}</${n.t}>`
  }
  return out
}

const idOf = (t: string, get: (k: string) => string | number | boolean | null | undefined) => `${t}|${get('class') ?? ''}|${get('data-series') ?? ''}|${get('data-xi') ?? ''}|${get('data-si') ?? ''}|${get('data-h') ?? ''}`

function write(el: Element, a: Attrs, tweens?: Tween[]) {
  for (const name of el.getAttributeNames()) if (!on(a[name]) && !runtime.has(name)) el.removeAttribute(name)
  for (const name in a) {
    if (!on(a[name])) continue
    const to = text(a[name]), from = el.getAttribute(name)
    if (from === to) continue
    if (tweens && from !== null && animated.has(name) && from.replace(NUMBER, '#') === to.replace(NUMBER, '#'))
      tweens.push({ el, name, from: from.match(NUMBER)!.map(Number), to: to.match(NUMBER)!.map(Number), bits: to.split(NUMBER), end: to })
    else el.setAttribute(name, to)
  }
}

/** Make `parent`'s children match `next`. Attribute changes join `tweens` instead when one is passed and they can. */
export function patch(parent: Element, body: readonly Kid[], tweens?: Tween[]) {
  const old = new Map<string, Element[]>()
  for (const el of parent.children) {
    const id = idOf(el.localName, k => el.getAttribute(k))
    old.get(id)?.push(el) ?? old.set(id, [el])
  }
  const next = tidy(body)
  if (next.length === 1 && typeof next[0] === 'string') { if (parent.textContent !== next[0]) parent.textContent = next[0]; return }
  let at: Element | null = parent.firstElementChild
  for (const n of next) {
    if (typeof n === 'string') continue
    const el = old.get(idOf(n.t, k => (on(n.a[k]) ? text(n.a[k]) : undefined)))?.shift() ?? parent.ownerDocument.createElementNS(SVG, n.t)
    write(el, n.a, el.parentNode ? tweens : undefined)
    patch(el, n.c, tweens)
    if (el === at) at = at.nextElementSibling
    else parent.insertBefore(el, at)
  }
  for (const list of old.values()) for (const el of list) el.remove()
}

/** Run `tweens` over `ms`, eased out, one attribute write per value per frame. Returns a cancel. */
export function play(tweens: Tween[], ms: number) {
  const land = () => { for (const t of tweens) t.el.setAttribute(t.name, t.end) }
  if (!ms) { land(); return () => {} }
  const t0 = performance.now()
  let frame = requestAnimationFrame(function step(now) {
    const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3
    if (k >= 1) return land()
    for (const t of tweens) t.el.setAttribute(t.name, t.bits.reduce((out, b, i) => out + b + (i < t.to.length ? t.from[i]! + (t.to[i]! - t.from[i]!) * e : ''), ''))
    frame = requestAnimationFrame(step)
  })
  return () => { cancelAnimationFrame(frame); land() }
}
