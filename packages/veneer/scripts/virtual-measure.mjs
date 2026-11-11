// Runs in the page: `selector` finds the moving rows, `scroller` is what moves, and each frame moves it by `step`.
export const SWEEP = async ({ scroller, row, step, frames, key }) => {
  const el = document.querySelector(scroller)
  const clip = el.getBoundingClientRect()
  // Only what's on screen: a row correcting in the overscan moves others that nobody can see.
  const read = () => {
    const out = new Map()
    for (const r of el.querySelectorAll(row)) {
      const b = r.getBoundingClientRect()
      if (b.height && b.bottom > clip.top && b.top < clip.bottom)
        out.set(r.getAttribute(key) ?? r.querySelector('[id]')?.id ?? r, b.top)
    }
    return out
  }
  const frame = () => new Promise(requestAnimationFrame)
  let worst = 0,
    blank = 0,
    most = 0,
    slow = 0,
    moved = 0,
    shared = 0
  const met = new Set()
  let last = read(),
    then = performance.now()
  for (let f = 0; f < frames; f++) {
    const before = el.scrollTop
    el.scrollTop = before + step
    await frame()
    const next = read(),
      want = step
    for (const k of next.keys()) met.add(k)
    const clamped = el.scrollTop <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1 // the edge took some of the step
    if (!clamped)
      for (const [k, top] of next)
        if (last.has(k)) {
          shared++
          worst = Math.max(worst, Math.abs(last.get(k) - top - want))
        }
    if (![...next.values()].length) blank++
    moved += want
    most = Math.max(most, el.querySelectorAll('*').length)
    const now = performance.now()
    if (now - then > 34) slow++
    then = now
    last = next
  }
  return {
    worstJump: +worst.toFixed(2),
    blankFrames: blank,
    nodes: most,
    slowFrames: slow,
    frames,
    moved,
    shared,
    rowsSeen: met.size,
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
  }
}

export const COVERED = ({ scroller, row }) => {
  const el = document.querySelector(scroller),
    box = el.getBoundingClientRect()
  const rows = [...el.querySelectorAll(row)]
    .map((r) => r.getBoundingClientRect())
    .filter((b) => b.height && b.bottom > box.top && b.top < box.bottom)
    .sort((a, b) => a.top - b.top)
  let overlap = 0,
    gap = 0
  rows.forEach((b, i) => {
    if (i) {
      overlap = Math.max(overlap, rows[i - 1].bottom - b.top)
      gap = Math.max(gap, b.top - rows[i - 1].bottom)
    }
  })
  return { rows: rows.length, overlap: +overlap.toFixed(2), gap: +gap.toFixed(2) }
}
