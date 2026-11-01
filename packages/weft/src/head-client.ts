// weft/head: the client half of page metadata (research 20 §3). The router calls `setHead` after a navigation with the
// next route's merged metadata: the same object the server wrote. It's for the tab title and history, not crawlers,
// which only read the server's HTML.

import { headTags, type Merged } from './head'

export type { Merged, Meta, Site } from './head'

/** Replace the `[data-wm]` tags with `m`'s (structured data just goes: nothing reads it here) and set `document.title`. */
export function setHead(m: Merged, path: string): void {
  const head = document.head
  head.querySelectorAll('[data-wm]:not(title)').forEach(e => e.remove())
  const at = head.querySelector('title[data-wm]')?.nextSibling ?? head.firstChild
  for (const [tag, attrs, text] of headTags(m, path)) {
    if (tag === 'title') { document.title = text!; continue }
    const e = document.createElement(tag)
    for (const k in attrs) e.setAttribute(k, attrs[k])
    e.setAttribute('data-wm', '')
    head.insertBefore(e, at)
  }
}
