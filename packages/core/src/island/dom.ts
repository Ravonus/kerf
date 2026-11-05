export const siblings = (a: Node, b: Node | null) => {
  const out: Node[] = []
  for (let n = a.nextSibling; n && n !== b; n = n.nextSibling) out.push(n)
  return out
}

export function comments(nodes: Node[], visit: (c: Comment) => void) {
  for (const n of nodes) {
    if (n.nodeType === 8) visit(n as Comment)
    else if (n.nodeType === 1) {
      const w = document.createTreeWalker(n, 128)
      while (w.nextNode()) visit(w.currentNode as Comment)
    }
  }
}

/** The markers of level `d` in `nodes`. */
export function bounds(nodes: Node[], d: number): [Comment | undefined, Comment | undefined] {
  let a: Comment | undefined, b: Comment | undefined
  comments(nodes, (c) => {
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
export function slot(open: Node, close: Node, trash: (ChildNode | Element)[]) {
  const ranges: Node[][] = []
  const w = document.createTreeWalker(open.parentNode!, 128)
  w.currentNode = open
  let a: Node | undefined
  let depth = 0
  while (w.nextNode() && w.currentNode !== close) {
    const c = w.currentNode as Comment
    if (c.data === 'ws' && !depth++) a = c
    else if (c.data === '/ws' && !--depth) {
      trash.push(a as ChildNode, c)
      ranges.push(siblings(a!, c))
    }
  }
  if (ranges.length) return ranges
  const t = close.nextSibling as HTMLTemplateElement | null
  if (t?.nodeName !== 'TEMPLATE') return [[]]
  trash.push(t)
  return [[...t.content.childNodes]]
}

export function closing(open: Node) {
  let depth = 0
  for (let n = open.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 8) continue
    const d = (n as Comment).data
    if (d === '[') depth++
    else if (d === ']' && depth-- === 0) return n
  }
  return null
}
