import { rt } from '../index/graph'

export function around(k: string) {
  const w = document.createTreeWalker(document.body, 128)
  let a: Comment | undefined
  for (let n; (n = w.nextNode() as Comment | null);) {
    if (n.data === 'wb:' + k) a = n
    else if (a && n.data === '/wb:' + k) return [a, n] as const
  }
  return undefined
}

/** The border box around the elements of a rendered value (nodes, arrays of them), or undefined when it has none. */
function boxOf(value: unknown): { w: number; h: number } | undefined {
  let top = Infinity,
    left = Infinity,
    bottom = -Infinity,
    right = -Infinity
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (typeof Element === 'undefined' || !(v instanceof Element) || !v.isConnected) return
    if (getComputedStyle(v).display === 'contents') return visit([...v.children]) // a shape variant's wrapper has no box
    const r = v.getBoundingClientRect()
    top = Math.min(top, r.top)
    left = Math.min(left, r.left)
    bottom = Math.max(bottom, r.bottom)
    right = Math.max(right, r.right)
  }
  visit(value)
  return top === Infinity ? undefined : { w: right - left, h: bottom - top }
}

/**
 * X031 (dev only, research 11 §8.5): at the swap, measure the `pending` fallback while it is still on screen and the
 * content once it is in, and warn when the boxes differ by more than 1 px (that difference is layout shift).
 */
export function checkSwap(fallback: unknown, content: unknown) {
  if (rt.server) return
  const before = boxOf(fallback)
  if (!before) return
  queueMicrotask(() => {
    const after = boxOf(content)
    if (!after) return
    const dw = after.w - before.w,
      dh = after.h - before.h
    if (Math.abs(dw) > 1 || Math.abs(dh) > 1) {
      const px = (n: number) => `${Math.round(n * 10) / 10}`
      console.warn(
        `weft: X031 <Boundary> pending fallback was ${px(before.w)}×${px(before.h)} px, the content is ${px(after.w)}×${px(after.h)} px (Δ ${px(dw)}, ${px(dh)}): the swap shifts layout. Size the fallback like the content (warp's <Shape> with the content's counts), or fix the size.`,
      )
    }
  })
}
