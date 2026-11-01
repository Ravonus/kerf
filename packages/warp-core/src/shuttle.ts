// The shuttle (docs/design/warp/redesign.md §3): one highlight per group that travels. It writes the two edges and the
// direction; warp.css runs each edge on its own timing, so the leading edge goes first and the trailing one follows.

/** Move `face` to span `a`..`b` along its axis. The first placement doesn't travel. */
export function moveShuttle(face: HTMLElement, a: number, b: number) {
  const was = parseFloat(face.style.getPropertyValue('--warp-a'))
  if (a < was) face.setAttribute('data-dir', 'back')
  else if (a > was) face.removeAttribute('data-dir')
  face.style.cssText = `--warp-a:${a}px;--warp-b:${b}px` // both ends in one write: a shuttle holds no other inline style
}
