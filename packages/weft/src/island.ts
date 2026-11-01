// Partial hydration on the client (PLAN §11). A static level is the server's HTML with no code behind it; the islands in
// it are the only components that run. `<!--wi:["id","key",[values]]-->` opens an island in the server's output,
// followed by its range; `<!--wl:d:["p",n]-->` … `<!--/wl:d-->` bound route level `d`. `level` adopts a level already
// in the page (`html` empty) or builds one the server sent for a navigation; the next level goes where its markers are.
//
// Islands claim by key like any hydration, each starting from the scope the server recorded. Disposal is the caller's:
// everything here is owned by the hole that shows the level.

import { onCleanup, rt, type SsrData } from './index'
import { hchild } from './claim'
import { hydration, sweep } from './hydrate'
import { keys, under } from './keys'

export type Load = (id: string) => (props: { v: unknown[]; s: unknown }) => unknown

const siblings = (a: Node, b: Node | null) => {
  const out: Node[] = []
  for (let n = a.nextSibling; n && n !== b; n = n.nextSibling) out.push(n)
  return out
}

function comments(nodes: Node[], visit: (c: Comment) => void) {
  for (const n of nodes) {
    if (n.nodeType === 8) visit(n as Comment)
    else if (n.nodeType === 1) {
      const w = document.createTreeWalker(n, 128)
      while (w.nextNode()) visit(w.currentNode as Comment)
    }
  }
}

/** The markers of level `d` in `nodes`. */
function bounds(nodes: Node[], d: number): [Comment?, Comment?] {
  let a: Comment | undefined, b: Comment | undefined
  comments(nodes, c => {
    if (c.data.startsWith(`wl:${d}:`)) a = c
    else if (c.data === `/wl:${d}`) b = c
  })
  return [a, b]
}

/**
 * The server's children of an island: in place, or in the `<template>` after it when it didn't render them. Taken once,
 * at mount: the markers go in the sweep, and the island may show these nodes again and again. An island that shows its
 * children twice (a label and its sweep copy) has a range for each, so each read takes the next.
 */
function slot(open: Node, close: Node) {
  const ranges: Node[][] = []
  const w = document.createTreeWalker(open.parentNode!, 128)
  w.currentNode = open
  let a: Node | undefined
  let depth = 0
  while (w.nextNode() && w.currentNode !== close) {
    const c = w.currentNode as Comment
    if (c.data === 'ws' && !depth++) a = c
    else if (c.data === '/ws' && !--depth) {
      hydration.trash.push(a as ChildNode, c)
      ranges.push(siblings(a!, c))
    }
  }
  if (ranges.length) return ranges
  const t = close.nextSibling as HTMLTemplateElement | null
  if (t?.nodeName !== 'TEMPLATE') return [[]]
  hydration.trash.push(t)
  return [[...t.content.childNodes]]
}

function closing(open: Node) {
  let depth = 0
  for (let n = open.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 8) continue
    const d = (n as Comment).data
    if (d === '[') depth++
    else if (d === ']' && depth-- === 0) return n
  }
  return null
}

/** A comment only the claim reads, which never belongs to a hole: a level's or an island's or a slot's. */
export const marks = (n: Node) => n.nodeType === 8 && /^\/?w[lis]:?/.test((n as Comment).data)

function mountIslands(nodes: Node[], load: Load) {
  const found: [Comment, boolean][] = []
  const tops = new Set(nodes)
  let nested = 0
  comments(nodes, c => {
    if (c.data.startsWith('wl:')) nested++
    else if (c.data.startsWith('/wl:')) nested--
    else if (!nested && c.data.startsWith('wi:')) found.push([c, tops.has(c)])
  })
  for (const [c, top] of found) {
    const [id, key, v] = JSON.parse(c.data.slice(3)) as [string, string, unknown[]]
    const open = c.nextSibling!
    const close = closing(open)
    const ranges = slot(open, close!)
    let read = 0
    const props = { v, get s() { return ranges[read++ % ranges.length] } }
    under(key + '/', () => hchild(c.parentNode as Element, () => load(id)(props), close, undefined, undefined, 1))
    // At the level's top with a range that stays: the island decides what's in it, so the level can't list it.
    if (top && !hydration.trash.includes(close as ChildNode)) {
      onCleanup(() => {
        for (let n: Node | null = c.nextSibling; n && n !== close; ) {
          const x: Node | null = n.nextSibling
          n.parentNode!.removeChild(n)
          n = x
        }
        close!.parentNode?.removeChild(close!)
        c.parentNode?.removeChild(c)
      })
    } else hydration.trash.push(c)
  }
}

/** Run `fn` as a claiming pass over `nodes`, for HTML that isn't part of `hydrate()`'s own pass. */
function claiming(nodes: Node[], data: SsrData | undefined, fn: () => void) {
  const { registry } = hydration
  for (const n of nodes) {
    if (n.nodeType !== 1) continue
    if ((n as Element).hasAttribute('wk')) registry.set((n as Element).getAttribute('wk')!, n as Element)
    for (const el of (n as Element).querySelectorAll('[wk]')) registry.set(el.getAttribute('wk')!, el)
  }
  const was = { d: rt.data, s: rt.state }
  rt.data = data
  rt.state = data?.s
  Object.assign(keys, { on: true, hydrating: true, p: '', n: 0 })
  try {
    fn()
  } finally {
    Object.assign(keys, { on: false, hydrating: false, p: '', n: 0 })
    rt.data = was.d
    rt.state = was.s
    registry.clear()
    sweep()
  }
}

let resume: [string, number] | undefined
/** End markers a parent level inserts before: they outlive the level they close. */
const anchors = new WeakSet<Node>()

/** A level's start: when a static level holds it, the key scope the server recorded there (`region`). */
export function enter<T>(fn: () => T): T {
  const s = resume
  resume = undefined
  return s && keys.on ? under(s[0], () => ((keys.n = s[1]), fn())) : fn()
}

/**
 * Show level `d`: the nodes of `html`, or those between its markers when `html` is empty, with its islands running and
 * `next` (the next level) where that level's markers are. The value goes in the hole that shows the level.
 */
export function level(html: string, d: number, next: () => unknown, load: Load, data?: SsrData): unknown {
  const page = !html
  const t = document.createElement('template')
  let own: Comment[] = []
  const read = () => {
    if (!page) return [...t.content.childNodes]
    const [a, b] = bounds([document.body], d)
    own = a && b ? [a, b] : []
    return a && b ? siblings(a, b) : []
  }
  t.innerHTML = html
  let nodes = read()
  const [a, b] = bounds(nodes, d + 1)
  resume = page && a ? (JSON.parse(a.data.slice(a.data.indexOf(':', 3) + 1)) as [string, number]) : undefined
  const scope = resume
  resume = undefined
  const islands = () => mountIslands(nodes, load)
  page ? islands() : claiming(nodes, data, islands)
  resume = scope
  hydration.trash.push(...own.filter(n => !anchors.has(n)))
  if (!page) sweep()
  nodes = read().filter(n => n === a || n === b || !marks(n))
  if (!a) return nodes
  const i = nodes.indexOf(a)
  if (i >= 0) {
    // At the level's top: the next level is part of this value.
    hydration.trash.push(a, b!)
    if (!page) sweep()
    return [...nodes.slice(0, i), next, ...nodes.slice(nodes.indexOf(b!) + 1)]
  }
  // Inside an element: its own hole, before the end marker, which stays as the anchor.
  hydration.trash.push(a)
  anchors.add(b!)
  if (!page) sweep()
  hchild(a.parentNode as Element, next, b)
  return nodes
}
