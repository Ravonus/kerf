// The shuttle (docs/design/veneer/redesign.md §3): one highlight per group that travels. It writes the two edges and the
// direction; veneer.css runs each edge on its own timing, so the leading edge goes first and the trailing one follows.

/** The two edges across the shuttle's axis: a group laid out in rows (a wrapping Segmented) moves on both. */
export interface Across {
  a: number
  b: number
}

/** Move `face` to span `a`..`b` along its axis, and `across.a`..`across.b` across it. The first placement doesn't travel. */
export function moveShuttle(face: HTMLElement, a: number, b: number, across?: Across) {
  const was = parseFloat(face.style.getPropertyValue('--veneer-a'))
  if (a < was) face.setAttribute('data-dir', 'back')
  else if (a > was) face.removeAttribute('data-dir')
  // all edges in one write: a shuttle holds no other inline style
  face.style.cssText =
    `--veneer-a:${a}px;--veneer-b:${b}px` +
    (across ? `;--veneer-ca:${across.a}px;--veneer-cb:${across.b}px` : '')
}
